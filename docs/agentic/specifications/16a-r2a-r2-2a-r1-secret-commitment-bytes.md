# Specification 16A-R2a-R2.2a-R1 — Postcondition-Safe Canonical Bytes

Status: approved replacement for Specification 16A-R2a-R2.2a. Execute after R2.1.

## Desired Behavior

Cestus adds one package-internal canonical-byte module. It accepts only exact
`Uint8Array` values backed by fixed, non-shared `ArrayBuffer` instances, enforces
the selected fixed, payload, and frame limits before allocation or copy, and returns
only a fresh canonical snapshot whose bytes exactly equal the accepted input. It
contains no frame, parser, public-record, ingestion, key, HMAC, backend, runtime, or
public-barrel behavior.

`packages/agent/src/secret-commitment-bytes.ts` preserves exactly these contracts:

```ts
export type SecretCommitmentByteLimit = 32 | 8_388_608 | 8_454_144;

export function trustedCanonicalSecretCommitmentByteLength(
  value: unknown,
  maximumLength: SecretCommitmentByteLimit
): number | undefined;

export function snapshotCanonicalSecretCommitmentBytes(
  value: unknown,
  maximumLength: SecretCommitmentByteLimit
): Uint8Array | undefined;
```

The actual runtime module namespace contains exactly
`snapshotCanonicalSecretCommitmentBytes` and
`trustedCanonicalSecretCommitmentByteLength`. Neither runtime function nor the type
is re-exported from an agent barrel. Tests dynamically import and inspect the actual
module namespace; a manually assembled stand-in is forbidden.

`32` remains an exact length. `8_388_608` and `8_454_144` remain inclusive maxima.
Trusted length rejects a selected-rule violation before own-key reflection, output
allocation, or copy. Every `SharedArrayBuffer` backing rejects. Every resizable or
growable backing rejects, including fixed-length views. Only exact native
`Uint8Array` objects with fixed, non-shared `ArrayBuffer` backing are accepted.

At module evaluation, capture the real Node classifiers and the exact intrinsic
getters, prototypes, reflection operations, constructor, and copy operation needed
to classify input and validate output without caller property reads. Captured
`isProxy` runs before each operation that could invoke an input or output Proxy trap.
Input validation never reads caller `length`, `buffer`, constructor, iterator,
`slice`, `set`, numeric index, or any other property and never invokes an accessor.
Missing, throwing, or malformed required intrinsics fail closed without fallback.

Input descriptor preflight accepts exactly canonical integer index keys `0` through
`length - 1`, no extra string or symbol key, and enumerable writable data
descriptors containing byte values. Detached views and every hostile or malformed
shape return `undefined` without throwing. The selected-rule length check precedes
own-key enumeration and every allocation/copy operation.

Snapshot allocation and copy use only captured intrinsics. After copy, trap-safe
postcondition validation proves all of the following before return:

- output is an exact native `Uint8Array` with the requested exact length;
- output has fixed, non-shared, non-resizable `ArrayBuffer` backing;
- output object and backing buffer do not alias the accepted input;
- output has exactly the canonical index keys and descriptors and no extra key; and
- every output byte exactly equals the corresponding accepted input byte.

A throwing or malformed constructor result, or a throwing, no-op, partial, or
wrong-byte copy operation, returns `undefined`. Postcondition classifiers,
reflection, and byte comparison are captured and fail closed. Output validation
occurs only after the unchanged input resource and pre-allocation ordering gates.

## Observable Acceptance Examples

- Before production behavior, the complete asserted test inventory compiles against
  undefined-return stubs. Typecheck and factory validation pass. Valid length,
  snapshot, correct-allocation, correct-copy, and postcondition controls fail
  meaningfully while rejection controls pass.
- A fresh Sol checkpoint review inspects the complete red diff and returns `proceed`
  before product behavior. Missing inventory or an oracle that cannot observe the
  production module is a checkpoint sizing exception, not an implementation repair.
- A dynamic import of the actual byte-module namespace has exactly the two approved
  runtime keys. The actual agent barrel has neither runtime function. No expected
  namespace is synthesized from production imports. A compile-time negative barrel
  assertion also proves the internal limit type is not re-exported.
- Fixed canonical controls cover lengths 0, 1, 31, and 32 and both inclusive limits
  at minus one/equal; exact-32 and payload/frame plus-one rejection proves zero
  output-constructor and copy calls before rejection.
- Existing Buffer, subclass, altered/cross-realm prototype, detached, Proxy,
  accessor, extra-key, shadowed property, noncanonical descriptor, shared backing,
  and resizable/growable backing matrices remain complete and count-asserted.
- Under independently reset fresh module loads, captured constructors cover: throw;
  wrong length; wrong prototype; input-object alias; input-backing alias;
  fixed SharedArrayBuffer backing; resizable ArrayBuffer backing; growable
  SharedArrayBuffer backing; detached backing; extra own string key; extra symbol
  key; noncanonical descriptor when constructible; and
  a separate exact canonical output control. Every malformed case returns
  `undefined` without throw. The inventory asserts twelve unconditional constructor
  cases (eleven malformed plus the control) and one additional supported-runtime
  noncanonical-descriptor case when it is constructible.
- Under independently reset fresh module loads, captured copy implementations cover:
  throw, no-op, prefix-only partial copy, suffix-only partial copy, one wrong byte,
  all wrong bytes, and an exact-copy control. Inputs contain distinct nonzero bytes
  so each corruption is observable. The inventory asserts all seven cases (six
  malformed plus the control). Every malformed case returns `undefined`.
- Successful output is fresh and exact. Caller mutation after synchronous return
  cannot change it; output mutation cannot change the caller. Output keys,
  descriptors, backing policy, non-aliasing, and every byte are independently
  asserted without using production helpers as expected-value oracles.
- Dynamic tests restore every modified global or intrinsic deterministically even
  when import, allocation, copy, or assertion fails. Inventory counts name every
  constructor, copy, input-shape, backing, resource-ordering, and success case.

## Allowed Scope

- `packages/agent/src/secret-commitment-bytes.ts`
- `packages/agent/test/secret-commitment-bytes.test.ts`
- Consume but do not modify integrated R2.1 source/tests.
- No contract/barrel/package/config, builder/parser, ingestion, key/HMAC/backend,
  runtime/provider/store/network/evidence/UI/PRR/legal/export/destructive/live work.
- Preserve but do not inspect, reuse, copy, cherry-pick, merge, amend, or push failed
  commits `f44d7f9c`, `16c18d06`, `f148869e`, `db1c3404`, or `0be31114`, or any
  earlier Specification 16/16A candidate.

## Relevant Context Entry Points

- factory authority files; this specification; Specification 16 umbrella; integrated
  R2.1 source/test; current package test configuration and Node intrinsic availability.

## Risk Lane

Red. This is a hostile byte boundary using synthetic public bytes only; no real
secret, runtime, external transfer, or live action is authorized.

## Targeted Verification

- `npm test -- packages/agent/test/secret-commitment-bytes.test.ts`
- `npm run typecheck`
- `npm run factory:check`
- `git diff --check`

The checkpoint must have asserted inventory counts, typecheck and factory success,
and meaningful red before a fresh Sol checkpoint `proceed`. After implementation,
all targeted commands exit zero using the existing local dependencies.

## Integration Verification

Update against latest local `neo`, obtain a new fresh Sol final `ship`, run
`npm run verify` exactly once, and integrate only without candidate-caused
regression. No install, push, network, external transfer, runtime, or live action.

## Escalation Conditions

Escalate for changed contracts, limits, backing policy, pre-allocation ordering,
dependencies or scope; unavailable trusted intrinsics; real secret/external action;
`GAPS`; missing mandatory checkpoint coverage; or the same concrete failure after
two focused implementation repairs.
