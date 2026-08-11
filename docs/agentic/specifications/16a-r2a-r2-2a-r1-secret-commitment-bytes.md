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

## Finite Runtime Trust Boundary

The TCB is the supported, untampered Node runtime intrinsics captured at module
evaluation: the classifiers and exact intrinsic getters, prototypes, reflection
operations, constructor, and copy operation needed to classify input and validate
output without caller property reads. This is a direct human finite trust model, not
a recursive proof of every captured intrinsic's semantic honesty.

Every caller-controlled input shape is untrusted, including values, Proxies,
buffers, views, descriptors, accessors, symbols, and mutations before or during an
operation. Captured trusted intrinsics classify each shape; a conforming exact
canonical `Uint8Array` input may be accepted. Only a nonconforming or
unclassifiable caller-controlled shape fails closed without invoking a caller Proxy
trap or accessor.
Captured `isProxy` runs before each operation that could invoke an input or output
Proxy trap. Input validation never reads caller `length`, `buffer`, constructor,
iterator, `slice`, `set`, numeric index, or any other property and never invokes an
accessor. Under the trusted runtime intrinsics, every ordinary `SharedArrayBuffer`
backing and every ordinary resizable or growable backing remains rejected.

Missing, throwing, malformed, or structurally unavailable required capabilities
disable the operation and fail closed without fallback. Semantically dishonest
foundational intrinsics replaced before module evaluation are out of scope,
including an arbitrarily lying captured `Reflect.apply` that disguises a
`SharedArrayBuffer`. Compromised-realm survival is a separate red architecture
decision; this slice neither promises it nor adds a recursive semantic-honesty
proof.

Input descriptor preflight accepts exactly canonical integer index keys `0` through
`length - 1`, no extra string or symbol key, and enumerable writable data
descriptors containing byte values. Detached views and every nonconforming or
unclassifiable shape return `undefined` without throwing. The selected-rule length
check precedes
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
- Primary Sol inspects the complete checkpoint diff and inventory counts, reruns the
  focused red suite, typecheck, factory validation, and diff check, and records the
  exact meaningful failures before any checkpoint review. A fresh Sol checkpoint
  reviewer then inspects that exact red diff/evidence and returns `proceed` before
  product behavior. Missing inventory or an oracle that cannot observe the production
  module is a checkpoint sizing exception, not an implementation repair.
- A dynamic import of the actual byte-module namespace has exactly the two approved
  runtime keys. The actual agent barrel has neither runtime function. No expected
  namespace is synthesized from production imports. A compile-time negative barrel
  assertion also proves the internal limit type is not re-exported.
- Fixed canonical controls cover lengths 0, 1, 31, and 32 and both inclusive limits
  at minus one/equal. Under the exact `32` rule, lengths 0, 1, and 31 reject as well
  as 33. Exact-32 lower/upper rejection and payload/frame plus-one rejection prove
  zero `Reflect.ownKeys`, output-constructor, and copy calls; equal-limit controls
  prove each instrumented seam is reached.
- Existing Buffer, subclass, altered/cross-realm prototype, detached, Proxy,
  accessor, extra-key, shadowed property, noncanonical descriptor, shared backing,
  and resizable/growable backing matrices remain complete and count-asserted.
- Under independently reset fresh module loads, bounded package-internal test seams
  or supported runtime allocation failures cover: throw; wrong length; wrong
  prototype; input-object alias; input-backing alias; fixed SharedArrayBuffer
  backing; resizable ArrayBuffer backing; growable SharedArrayBuffer backing;
  detached backing; extra own string key; extra symbol key; transparent output Proxy;
  throwing output Proxy; noncanonical descriptor when constructible; and
  a separate exact canonical output control. Every malformed case returns
  `undefined` without throw. Both output-Proxy cases assert zero trap calls. The
  inventory asserts fourteen unconditional constructor cases (thirteen malformed
  plus the control) and one additional supported-runtime noncanonical-descriptor case
  when it is constructible. Such seams are bounded to tests, have no public export,
  and do not replace or corrupt the captured foundational trust root.
- Under independently reset fresh module loads, bounded package-internal test seams
  or supported runtime copy failures cover: throw, no-op, prefix-only partial copy,
  suffix-only partial copy, one wrong byte, all wrong bytes, and an exact-copy
  control. Inputs contain distinct nonzero bytes so each corruption is observable.
  The inventory asserts all seven cases (six malformed plus the control). Every
  malformed case returns `undefined`. These tests have no public export and do not
  replace or corrupt the captured foundational trust root.
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

Primary Sol must inspect and rerun the checkpoint, confirm asserted inventory counts,
typecheck/factory/diff-check success and meaningful red, then obtain a fresh Sol
checkpoint `proceed`. After implementation, all targeted commands exit zero using
the existing local dependencies.

## Integration Verification

Update against latest local `neo`, obtain a new fresh Sol final `ship`, run
`npm run verify` exactly once, and integrate only without candidate-caused
regression. No install, push, network, external transfer, runtime, or live action.

## Escalation Conditions

Escalate for changed contracts, limits, backing policy, pre-allocation ordering,
dependencies or scope; unavailable trusted intrinsics; real secret/external action;
`GAPS`; missing mandatory checkpoint coverage; or the same concrete failure after
two focused implementation repairs.
