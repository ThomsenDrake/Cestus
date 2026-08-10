# Specification 16A-R2b — Authority-Owned Secret Commitment Boundary

Status: approved authority slice. Execute only after 16A-R2a-R2.1, R2.2a through
R2.2c, and R2.3 are integrated.

## Desired Behavior

Cestus implements the closed non-exporting key mutation and commitment boundary
over the exact protocol contracts and codecs integrated by Specifications
16A-R2a-R2.1, R2.2a through R2.2c, and R2.3.
The product-facing `SecretCommitmentPort` extends
`SecretCommitmentComputePort` with only `createKey` and `rotateKey`; it therefore
exports exactly four operations and no generic HMAC, digest, key export,
caller-defined domain, backend-current selector, or arbitrary Secret Service call.

The injected authority, never the port or backend, owns mutation decisions,
reservation identity, state transitions, reconciliation, replay, publication,
current selection, and durable record-reference validation. The port contains no
reservation or current-selection map/variable. Reconstructing the port over the
same authority preserves in-flight reconciliation, publication retry, identical
replay, and current selection. The strict fake authority stores an append-only
synthetic event sequence and can reconstruct its projection from copied safe
events; Specification 16B replaces it with mounted durable authority without
changing the product port contract.

Mutation requests and trusted decisions are exact immutable own-data objects:

```ts
interface SecretCommitmentMutationRequest {
  readonly contractVersion: 1;
  readonly decisionId: string;
  readonly mutationKind: "create-key" | "rotate-key";
  readonly requestId: string;
  readonly workspaceId: string;
  readonly expectedCurrentVersion: number; // zero for create, positive for rotate
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

interface SecretCommitmentPort extends SecretCommitmentComputePort {
  createKey(request: SecretCommitmentMutationRequest): Promise<KeyMutationResult>;
  rotateKey(request: SecretCommitmentMutationRequest): Promise<KeyMutationResult>;
}
```

Callers submit only a mutation request. Caller `actorId`/`actorKind` fields are
extra-property rejection and never authenticate. The authority resolves
`decisionId` from its trusted staged-decision boundary and atomically matches
actor kind exactly `human`, actor identity, mutation kind, request, workspace,
expected version, backend, and key before reservation. `agent`, `system`,
`extractor`, changed human, or any substituted binding fails before backend use.

The authority executes mutation through a closed injected effects interface whose
only methods are `createExactKey(reference)` and `lookupExactKey(reference)`.
This makes reservation transitions one authority-owned atomic operation rather
than port-local coordination. The backend receives an exact positive version and
never chooses current state.

```ts
type BackendCreateResult =
  | { readonly status: "created"; readonly key: SecretCommitmentKeyReference }
  | { readonly status: "already-present"; readonly key: SecretCommitmentKeyReference }
  | { readonly status: "unavailable-before-effect" }
  | { readonly status: "indeterminate" };

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

The authority interface is normative. `executeMutation` owns the complete state
machine and is the only mutation entry point used by the port. Its `effects`
object exposes only exact create and lookup and is never retained or serialized.
The port may delegate but may not interpret or duplicate reservation state.

```ts
interface SecretCommitmentMutationEffects {
  createExactKey(key: SecretCommitmentKeyReference): Promise<BackendCreateResult>;
  lookupExactKey(key: SecretCommitmentKeyReference): Promise<BackendLookupResult>;
}

type CurrentKeyResult =
  | { readonly status: "current"; readonly key: SecretCommitmentKeyReference }
  | { readonly status: "none" }
  | { readonly status: "unavailable" };

type RecordReferenceResult =
  | { readonly status: "valid" }
  | { readonly status: "invalid" }
  | { readonly status: "unavailable" };

interface SecretCommitmentAuthority {
  executeMutation(
    request: SecretCommitmentMutationRequest,
    effects: SecretCommitmentMutationEffects
  ): Promise<KeyMutationResult>;
  currentKey(workspaceId: string): Promise<CurrentKeyResult>;
  validateRecordReference(
    record: SecretCommitmentPublicRecord
  ): Promise<RecordReferenceResult>;
}
```

Construction seams are exact and fail closed:

```ts
type CommitmentComparator = (
  left: Uint8Array,
  right: Uint8Array
) => boolean;

interface CreateSecretCommitmentPortInput {
  readonly backend: SecretCommitmentBackend;
  readonly authority: SecretCommitmentAuthority;
  readonly compare: CommitmentComparator;
}

function createSecretCommitmentPort(
  input: unknown
): SecretCommitmentPort | undefined;

interface SecretServiceCommitmentClient {
  createExactKey(key: SecretCommitmentKeyReference): Promise<unknown>;
  lookupExactKey(key: SecretCommitmentKeyReference): Promise<unknown>;
  computeExactHmac(
    key: SecretCommitmentKeyReference,
    frame: Uint8Array
  ): Promise<unknown>;
}

function createSecretServiceCommitmentBackend(input: unknown):
  | SecretCommitmentBackend
  | undefined;
```

Each factory accepts one exact own-data dependency object and exact own-data method
objects; invalid/proxy/prototype/inherited/accessor/symbol/non-enumerable/
extra/missing construction returns `undefined` without invoking an accessor. The
port snapshots normalized method references and holds no lifecycle/current data.
The adapter copies every input and normalizes client `unknown` results.

Request validation and blocked precedence are exact:

1. Invalid or hostile request shape, non-scalar/empty IDs, `createKey` with any
   kind/version except `create-key`/zero, `rotateKey` with any kind/version except
   `rotate-key`/a positive safe integer, or `expectedCurrentVersion + 1` overflow
   returns `blocked/decision-invalid` before authority or backend use.
2. Authority throw or malformed top-level authority result returns
   `blocked/authority-unavailable`.
3. Missing, malformed, nonhuman, or unstaged trusted decision returns
   `blocked/decision-invalid`.
4. A valid staged decision whose mutation/request/workspace/version/backend/key
   binding differs from the request returns `blocked/decision-mismatch`. Actor
   identity is not caller input; it remains the immutable identity captured by the
   trusted staged decision.
5. An identical published request returns `replayed` before stale checks.
6. A different request colliding with an active reservation for the same workspace
   and expected/target version returns `blocked/reservation-conflict`, regardless
   of its backend or key ID. One workspace can have only one mutation for a version.
   An exact backend/key/version reference already reserved or published for another
   workspace also returns `reservation-conflict` before effects.
7. Otherwise a current-version mismatch returns `blocked/stale-version`; only an
   exact current match may reserve.

Target version is always `expectedCurrentVersion + 1`; neither port, backend,
decision, nor caller supplies another target. Reservation atomically appends the
complete decision/request identity and target before any awaitable effect. Two
independently authorized contenders therefore yield one winner before generation.
Authority maintains a global safe-reference ownership index so the same exact
backend/key/version cannot be created, reserved, or published for two workspaces.

`executeMutation` serializes live calls per workspace inside the authority. An
identical call arriving while create, lookup, or publication is in flight waits for
that call to settle, then re-evaluates the append-only projection; it never starts a
second effect concurrently. After the first call publishes it returns `replayed`;
after an indeterminate create it enters reconciliation; after publication failure
it may make the single publication retry from retained `generated` state. A process
restart has no live lock, so recovered `generating` follows the mandatory lookup
path below. The lock is synchronization only; events remain the reconstructable
source of lifecycle truth.

The authority projection uses exactly
`reserved -> generating -> reconciling | generated -> published` with this complete
transition/result table:

- `reserved`: append `generating`, call create once. Exact `created` or
  `already-present` with the target reference appends `generated` and proceeds to
  publication. Exact `unavailable-before-effect` appends a return-to-`reserved`
  event and returns `unavailable/backend-unavailable`; only the identical request
  may retry creation. `indeterminate`, throw, malformed result, or wrong reference
  appends `reconciling` and returns `unavailable/outcome-unreconciled`.
- recovered `generating`: before any effect, append `reconciling` and perform exact
  lookup. It must never call create directly because the prior effect is unknown.
- `reconciling`: exact target `present` appends `generated` and proceeds to
  publication. Exact `missing` appends `reserved`, then that same invocation may
  append `generating` and make one create attempt. `ambiguous`, `unavailable`,
  throw, malformed result, or wrong reference stays `reconciling`, returns
  `unavailable/outcome-unreconciled`, and never generates.
- `generated`: attempt publication without create or lookup. Exact publication
  success appends `published`, consumes the decision, and selects the target;
  return `created`. Publication failure, throw, or malformed result retains
  `generated` and returns `unavailable/publication-unavailable`; the identical
  request retries publication only.
- `published`: the identical request returns `replayed` with the published
  reference and performs no effect. A competing stale request follows the blocked
  precedence above. Current selection changes only through the published event.

The strict fake factory returns an exact fixture object with separate
`authority: SecretCommitmentAuthority` and test-only `controls`. The authority
object has exactly the three normative methods and no staging, event, counter, or
barrier member. Controls expose
`stageTrustedDecision(candidate): "staged" | "replayed" | "rejected"`, copied
event export, reconstruction input, deterministic effect/publication barriers, and
safe counters. Staging accepts only an exact human decision and stores an immutable
copy.
An identical `decisionId` plus every identical field is a no-op `replayed`; any
changed field, including `actorId`, is `rejected` and cannot replace the original.
Reconstruction rejects malformed, hostile, out-of-order, impossible, duplicate,
or conflicting events rather than repairing them. Replayed safe events reproduce
reservations, recovered-generating reconciliation, generated metadata, publication,
current selection, retained references, decision consumption, and results. Events
contain no key bytes, HMAC, effects object, comparator, or secret-bearing error.

The Secret Service adapter accepts only exact client union members. Exact created,
already-present, and present results must repeat the requested reference. A malformed
post-create result, wrong reference, or creation exception becomes `indeterminate`,
never known no-effect. A malformed/wrong lookup result or lookup exception becomes
`unavailable`, which keeps authority reconciliation non-generating. A malformed,
wrong-length, or throwing HMAC result becomes `unavailable`. No exception or
diagnostic includes client data or secret material.

Port compute/verify normalization is exact. Compute parses the integrated R2.2c frame first;
invalid profile/frame rejects before authority/backend. Authority current-key throw,
malformed, or unavailable maps to `unavailable/authority-unavailable`; `none` maps
to `unavailable/key-unavailable`. Backend HMAC missing maps to `key-unavailable`,
and malformed/throwing/unavailable maps to `backend-unavailable`. A computed record
is constructed only from parsed public bindings, the authority key reference, and
one copied 32-byte HMAC, then passes integrated R2.1 normalization before return.

Verify normalizes the record and frame first. Profile/class/public-binding mismatch
returns `rejected/record-reference-invalid` before authority/backend. Authority
reference invalid maps to `record-reference-invalid`; authority throw, malformed,
or unavailable maps to `authority-unavailable`. It then addresses only the record's
exact backend/key/version. Missing retained material returns
`unverifiable/key-lost`; malformed/throwing/unavailable HMAC returns
`backend-unavailable`. The comparator receives two copied 32-byte values exactly
once only on a valid comparable path: `true` is `valid`, `false` is `mismatch`, and
a throw maps to `unavailable/backend-unavailable`. All earlier paths invoke it zero
times. A comparator return other than primitive boolean is also
`unavailable/backend-unavailable`; truthy coercion is forbidden. Current material
is never substituted for an old reference.

## Observable Acceptance Examples

- One staged exact human decision creates version one through the fake Secret
  Service adapter, computes a known HMAC fixture, and verifies it without any
  reflected, enumerable, serialized, accessor, symbol, error, or diagnostic
  surface exposing synthetic key bytes.
- Decision/request tables reject hostile shapes, all nonhuman kinds, changed actor,
  operation, request, workspace, expected version, backend, or key before effects.
- Two separately staged create contenders and two separately staged rotation
  contenders use barriers to start concurrently. Exactly one reservation wins,
  exactly one effective generation and publication occur, and the loser never
  calls the backend.
- Reconstruction tests create a new port over the same authority and a new fake
  authority from copied events at each state. Identical replay, current selection,
  reconciliation, and publication retry remain unchanged.
- Failures before effect, exceptions/indeterminate outcomes after possible effect,
  exact present/missing/ambiguous/malformed/throwing/unavailable reconciliation,
  and publication failure each assert the exact next state and call counts. No
  indeterminate path generates before an exact missing lookup.
- Rotation publishes version two while a version-one record still verifies.
  Removing version-one material yields `unverifiable/key-lost`, never version-two
  HMAC or a fallback digest.
- Adapter tables cover every valid result plus null, array, proxy, prototype,
  inherited, accessor, symbol, non-enumerable, extra/missing fields, wrong exact
  reference, wrong HMAC length, and thrown client method without accessor
  invocation, publication, comparison, or leakage.
- Both exact integrated R2.2b/R2.2c profiles compute and verify. A third profile, malformed frame
  or record, class swap, binding substitution, lost/unavailable key, and comparator
  throw fail closed with the specified result and call counts.
- Reconstructing only the port never loses authority state. Static/export tests
  reject reservation/current maps in the port and reject generic HMAC, digest,
  export, implicit create, and backend-selection operations.

## Allowed Scope

- `packages/agent/src/secret-commitment-port.ts`
- `packages/agent/test/secret-commitment-port.test.ts`
- `packages/agent/src/os-secret-store.ts` only if an indispensable adjacent closed
  client seam is required without changing existing credential behavior
- `packages/agent/test/os-secret-store.test.ts` only for that adjacent seam
- Consume but do not modify the integrated R2.1, R2.2a-R2.2c, and R2.3 contract, codec, ingestion
  source, or tests.
- Do not modify package manifests, local-runtime, source scanning, evidence, UI,
  ontology truth, providers, PRR, legal, export, publication, or destructive code.
- Preserve but do not inspect or reuse any failed Specification 16/16A candidate.

## Relevant Context Entry Points

- `AGENTS.md`
- `docs/agentic/software-factory.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/specifications/16-secret-commitment-backend.md`
- `docs/agentic/specifications/16a-r2a-r2-1-secret-commitment-records.md`
- `docs/agentic/specifications/16a-r2a-r2-2-secret-commitment-codecs.md`
- `docs/agentic/specifications/16a-r2a-r2-3-secret-source-commitment-service.md`
- `packages/agent/src/secret-commitment-contract.ts`
- `packages/agent/test/secret-commitment-contract.test.ts`
- `packages/agent/src/os-secret-store.ts`
- `packages/agent/test/os-secret-store.test.ts`

## Risk Lane

Red. This slice implements secret and authenticated-human trust boundaries, but
verification may use only synthetic in-memory keys and fake authority/client
fixtures. Any real Secret Service key creation remains separately human-gated.

## Targeted Verification

- `npm test -- packages/agent/test/os-secret-store.test.ts packages/agent/test/secret-commitment-contract.test.ts packages/agent/test/secret-commitment-port.test.ts`
- `npm test -- packages/ingestion/test/secret-source-commitment.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

Every command must exit zero using the existing local dependency installation.
Tests must prove all acceptance examples with synthetic data and no live effects.

## Integration Verification

Update normally against latest local `neo`, obtain a fresh Sol `ship` verdict,
then run `npm run verify` once. Reject candidate-caused new or worsened failures
against the recorded baseline. Integrate with normal Git ancestry. Do not install
dependencies, open a pull request, force-push, or transfer external bytes.

## Escalation Conditions

Escalate for port-owned lifecycle/current state, a creation exception classified
as known no-effect, a key-exporting/generic crypto API, changed integrated R2.1/R2.2a-R2.2c/R2.3 protocol,
automatic creation or version selection, real key use, unavailable existing local
dependencies, scope outside named agent files, or the same concrete failure
surviving two focused repairs.
