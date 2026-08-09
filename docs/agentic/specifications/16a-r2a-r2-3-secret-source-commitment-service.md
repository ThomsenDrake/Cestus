# Specification 16A-R2a-R2.3 — Nonce-Owning Ingestion Service

Status: approved replacement slice 3 of 3. Execute only after R2.1 and R2.2 integrate.

## Desired Behavior

Cestus adds the key-free ingestion domain service over the integrated exact protocol
and one synthetic `SecretCommitmentComputePort`. This slice creates no key, HMAC,
backend, store, credential, or runtime authority and does not modify the agent codec.

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

Factory, nested port, nonce function, methods, method inputs, records, byte fields,
and port results use the integrated trap-safe classifiers before reflection or use.
The factory closes over exact non-Proxy function references and returns one frozen
exact service. Production uses exact indexed method types from
`SecretCommitmentComputePort`; no `any`, `Function`, double cast, string/byte cast,
or profile-narrower port signature is permitted.

Observation compute snapshots the complete request synchronously, obtains exactly
one nonce, snapshots it immediately after the await, and performs an atomic
synchronous equal-content check-and-reservation before any later await or port call.
Reserved nonce content stays consumed even if builder or port later rejects or is
unavailable. Observation verify obtains nonce only from the normalized record.

All six methods use integrated builders and pass fresh frame copies. Compute accepts
only an exact normalized record whose profile, class, nonce, and every public binding
matches the request; a different structurally valid key reference remains accepted
here for R2b authority validation. Verify compares all record-carried bindings before
port use. Payload-only change delegates so the port may return mismatch.

Invalid input/record/nonce/result/binding returns `rejected/invalid-record` without a
later port call. Throwing nonce returns `unavailable/nonce-unavailable`; throwing
compute/verify returns `unavailable/backend-unavailable`. Exact permitted compute and
verify result members propagate as new frozen exact objects.

## Observable Acceptance Examples

- Before product implementation, tests define a direct type-correct queued fake port,
  complete six-operation calls, exact-result tables, binding tables, and five
  deferred-barrier scenarios against an undefined-return factory scaffold. Primary
  inspects the inventory and meaningful red failures; missing inventory is a sizing
  exception, not repair work.
- All six operations succeed through the strict fake. Frames observed by the fake
  equal independent R2.2 literal fixtures; expected frames never come from production
  builders/parser/normalizer. Manifest and entry cannot substitute one another.
- Factory and each method generate null/array/prototype/inherited/missing/extra/
  symbol/non-enumerable/accessor/transparent-Proxy/throwing-Proxy cases. Nested port,
  functions, records, results, and every byte field receive the same relevant cases
  with zero trap/accessor calls and exact port-call counts.
- Every permitted compute/verify union member propagates; every wrong status/reason,
  missing/extra/symbol/accessor/Proxy member rejects. Computed results independently
  substitute profile, class, nonce, every public binding, and key reference; only a
  valid-different key reference is structurally accepted.
- Each verify operation substitutes every carried public binding and rejects before
  port use. Changing only observed/protected payload delegates and may mismatch.
- Deferred barriers prove synchronous request snapshots, resolved-nonce snapshot,
  independent port frame/record copies, frozen port-result snapshots, and two
  concurrently resolved identical nonces yielding exactly one reservation/port call.
  A nonce reserved before later backend failure remains rejected on retry.
- Throwing nonce and port mappings are exact. Short/long/detached/Proxy nonce rejects.
  Two normal distinct nonces for identical observations produce distinct records.
- No surface exports key creation/rotation, backend, HMAC, digest, key export,
  authority, current selection, Secret Service, fallback, credential, or runtime
  operations.

## Allowed Scope

- `packages/ingestion/src/secret-source-commitment.ts`
- `packages/ingestion/test/secret-source-commitment.test.ts`
- Consume but do not modify integrated R2.1/R2.2 agent source/tests.
- No package/config/barrel, source scanning, evidence, UI, ontology, provider, store,
  runtime, PRR, legal, export, publication, or destructive behavior.
- Preserve and do not inspect, reuse, copy, cherry-pick, merge, amend, or push failed
  Specification 16/16A candidates.

## Relevant Context Entry Points

- factory authority files; this specification; integrated agent contract/test;
  `packages/ingestion/src/runtime.ts` only for package convention.

## Risk Lane

Red. This composes a cryptographic public-record boundary with a synthetic port; no
real secret or external action is authorized.

## Targeted Verification

- `npm test -- packages/ingestion/test/secret-source-commitment.test.ts`
- `npm test -- packages/agent/test/secret-commitment-contract.test.ts`
- `npm run typecheck`
- `npm run ui:build`
- `npm run factory:check`

## Integration Verification

Update local `neo`, obtain fresh Sol `ship`, run `npm run verify` once, and integrate
only without candidate-caused regression. No install, push, external transfer, or
live action.

## Escalation Conditions

Escalate for changed integrated records/frames, scope beyond two files, any real
secret/external action, `GAPS`, or the same concrete failure after two repairs.
