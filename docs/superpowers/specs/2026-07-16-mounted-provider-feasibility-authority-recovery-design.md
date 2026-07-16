# Mounted Provider Feasibility Authority Recovery Design

**Date:** 2026-07-16
**Status:** Coordinator correction pending fresh review
**Authority:** `RV-1-E-595` through `RV-1-E-597` in
`docs/agentic/resident-agent-full-vision-program-registry.md`

## Purpose

The provider design requires an absent official Codex or xAI subscription
flow to become append-only, secret-safe `official-flow-unavailable` evidence.
The evidence must be written to and read back from the current portable
workspace before any harness reports unavailable.

Two bounded Task129 repairs proved that the current ownership graph cannot
satisfy that contract inside the agent harness:

- a raw append callback can resolve without committing anything; and
- a module-private operation remains forgeable when any caller can invoke its
  public issuer with a fake mounted owner.

Task130 fails closed, but it has the same missing durable-evidence dependency.
Neither harness has a production caller, and the ontology has no dedicated
provider-feasibility event. The smallest correct recovery is therefore a
mounted local-runtime authority card between the existing mounted authority
operation and the two pure provider classifiers.

This correction also versions the Task136 release graph from 28 to 29 cards.
It preserves the first three strict v4 release records byte-for-byte, keeps the
v4 release-record schema unchanged, and leaves Task139 blocked.

## Non-Goals

- No provider, network, credential, OAuth, API, browser, CLI-auth-store, or
  external-service operation is performed.
- No Codex or xAI official flow is claimed to exist.
- No provider posture is added to portable-workspace lifecycle facts before
  Task139 owns canonical provider configuration.
- No second ledger, fallback store, internal-drive state, mutable projection,
  or hidden feasibility cache is introduced.
- No general JavaScript value-flow analyzer is added to Task137.
- No full `npm run verify`, push, reset, Task139 work, or `neo` action is
  authorized by this recovery.

## Considered Approaches

### 1. Pure classifiers plus mounted local-runtime recorder - selected

Codex and xAI modules validate provider-specific posture and classify an
absent official flow. They cannot append, mint mounted authority, or return an
`unavailable` result. A local-runtime bridge accepts that normalized advisory
classification only together with an exact factory-issued
`MountedArtifactAuthorityOperation`. It appends a dedicated ontology event,
rereads the exact committed event, revalidates currentness after every async
boundary, and only then returns `official-flow-unavailable`.

This preserves package direction, makes the trust root explicit, and keeps
provider semantics separate from workspace authority.

### 2. Another callback or harness-issued operation - rejected

A callback can lie by resolving without a durable write. A harness-issued
operation authenticates only the harness module, not the mounted workspace
owner. Both variants were implemented, tested, and independently rejected.

### 3. Defer all feasibility persistence to Task139 - rejected

Task139 depends on released Task129 and Task130. Moving their missing authority
behind Task139 creates a dependency cycle or forces the harness cards to claim
durability they do not have. The new prerequisite card breaks that cycle.

## Architecture

```text
Codex/xAI posture input
  -> provider-specific pure classifier
  -> agent-official-flow-absence.v1
  -> mounted official-flow feasibility recorder
  -> exact factory-issued mounted authority operation
  -> current mounted ledger append
  -> exact ledger stream readback
  -> post-readback mounted-currentness check
  -> official-flow-unavailable result
```

The classification is advisory data. It is not authority and can be created
without storage access. The mounted operation is authority. It cannot be
structurally forged, copied into usefulness, issued by the harness, or
substituted with a `LocalRuntimeHandle`.

### Shared absence witness and classification

`packages/agent/src/official-flow-feasibility.ts` defines a process-local,
WeakMap-backed witness. The public object deliberately carries no durable
posture:

```ts
interface OfficialFlowAbsenceWitnessV1 {
  readonly schemaVersion: "agent-official-flow-absence-witness.v1";
  readonly providerFamily: "codex" | "xai";
}
```

`createOfficialFlowAbsenceWitness(input)` accepts one exact plain own-data
input containing the fields below plus `officialFlow: undefined`. It compares
the configured and assessed posture snapshots field-for-field, strictly
normalizes them, computes the classification hash, freezes the public witness,
and stores the complete normalized classification in a module-private
`WeakMap`. `inspectOfficialFlowAbsenceWitness(witness)` returns that frozen
snapshot only for the exact issued object identity. Copies, serialized values,
proxies, fabricated lookalikes, and witnesses issued for another provider
family are invalid. Creating or inspecting a witness performs no I/O, append,
approval, provider, credential, or authority action.

The private normalized snapshot is:

```ts
interface OfficialFlowAbsenceClassificationV1 {
  readonly schemaVersion: "agent-official-flow-absence.v1";
  readonly residentAgentId: "agent_default";
  readonly workspaceId: `ws_${string}`;
  readonly mountInstanceId: `mount_${string}`;
  readonly taskId: `task_${string}`;
  readonly attemptId: `attempt_${string}`; // exact /^attempt_[a-f0-9]{64}$/
  readonly runId: `run_${string}`;
  readonly providerFamily: "codex" | "xai";
  readonly providerId: `provider_${string}`;
  readonly modelId: string;
  readonly capabilityHash: `sha256:${string}`;
  readonly credentialRefId: `agent_credref_${string}`;
  readonly credentialKind: "subscription-oauth" | "device-code-oauth";
  readonly capabilityScopes: readonly string[];
  readonly policyVersion: string;
  readonly officialFlowId: string;
  readonly approvalClass: "provider-byte-transfer";
  readonly approvalBindingHash: `sha256:${string}`;
  readonly sourceEventIds: readonly `evt_${string}`[];
  readonly causationEventId: `evt_${string}`;
  readonly classification: "official-flow-absent";
  readonly classificationHash: `sha256:${string}`;
}

type OfficialFlowAbsencePostureV1 = Omit<
  OfficialFlowAbsenceClassificationV1,
  "schemaVersion" | "classification" | "classificationHash"
>;

interface CreateOfficialFlowAbsenceWitnessInput {
  readonly configuredPosture: OfficialFlowAbsencePostureV1;
  readonly assessedPosture: OfficialFlowAbsencePostureV1;
  readonly officialFlow: undefined;
}
```

The creator accepts only plain own-data objects and dense ordinary arrays,
rejects symbols, accessors, custom prototypes, sparse arrays, unknown keys,
unsafe text, provider-family mismatches, and noncanonical hashes, and freezes
one normalized snapshot. The classification hash is computed over the exact
canonical fields other than `classificationHash`.

`capabilityScopes` and `sourceEventIds` must be nonempty and duplicate-free;
the creator stores each in ascending Unicode code-point order. The causation
event must occur in `sourceEventIds`. The classification hash preimage is the
UTF-8 bytes of `JSON.stringify` over one ordinary object constructed in the
exact interface field order above, beginning with `schemaVersion` and ending
with `classification`, with `classificationHash` omitted. The digest is
lowercase SHA-256 prefixed by `sha256:`.

The frozen classification test vector is:

```text
JSON: {"schemaVersion":"agent-official-flow-absence.v1","residentAgentId":"agent_default","workspaceId":"ws_review","mountInstanceId":"mount_review","taskId":"task_review","attemptId":"attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","runId":"run_review","providerFamily":"codex","providerId":"provider_openai_codex_review","modelId":"codex-review","capabilityHash":"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","credentialRefId":"agent_credref_review","credentialKind":"subscription-oauth","capabilityScopes":["harness-execution"],"policyVersion":"policy_review.v1","officialFlowId":"codex-review","approvalClass":"provider-byte-transfer","approvalBindingHash":"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","sourceEventIds":["evt_approval_review","evt_checkpoint_review"],"causationEventId":"evt_checkpoint_review","classification":"official-flow-absent"}
SHA-256: sha256:bdae51eff3aedbc86bdec0de666fde4019fc6f920ae23ba09ac06211fa9eb8b6
```

Provider-specific constraints are exact:

- `codex` requires a `provider_openai_codex_...` provider ID and a
  `codex-...` official-flow ID.
- `xai` requires a `provider_xai_...` provider ID and an `xai-...`
  official-flow ID.
- both require `harness-execution` scope, one of the two subscription OAuth
  credential kinds, and the existing approved provider-byte-transfer binding.
- the canonical workspace prefix is `ws_`; the provisional `workspace_`
  harness prefix is rejected.

The witness and classification do not say that the provider is durably
unavailable. They say only that the shared strict classifier found no supplied
official flow under two equal normalized posture snapshots. Only the mounted
recorder can inspect the exact witness and convert it into durable evidence.

### Dedicated feasibility event

`packages/ontology/src/contracts.ts` adds
`agent.provider.feasibility.observed.v1`. It routes to:

```text
agent_provider_feasibility_<taskId>_<attemptId>_<runId>_<providerId>
```

Its strict payload is:

```ts
interface AgentProviderFeasibilityObservedV1 {
  readonly recordVersion: "agent-provider-feasibility.v1";
  readonly residentAgentId: "agent_default";
  readonly workspaceId: `ws_${string}`;
  readonly mountInstanceId: `mount_${string}`;
  readonly admissionGenerationId: string;
  readonly workspaceIdentityEventId: `evt_${string}`;
  readonly mountEvidenceId: string;
  readonly authorityEvidenceId: string;
  readonly ledgerStoreEvidenceId: string;
  readonly policyVersion: string;
  readonly policyDigest: string;
  readonly lockStateDigest: string;
  readonly highWaterMark: string;
  readonly highWaterOrdinal: number;
  readonly taskId: `task_${string}`;
  readonly attemptId: `attempt_${string}`; // exact /^attempt_[a-f0-9]{64}$/
  readonly runId: `run_${string}`;
  readonly providerFamily: "codex" | "xai";
  readonly providerId: `provider_${string}`;
  readonly modelId: string;
  readonly capabilityHash: `sha256:${string}`;
  readonly credentialRefId: `agent_credref_${string}`;
  readonly credentialKind: "subscription-oauth" | "device-code-oauth";
  readonly capabilityScopes: readonly string[];
  readonly officialFlowId: string;
  readonly approvalClass: "provider-byte-transfer";
  readonly approvalBindingHash: `sha256:${string}`;
  readonly posture: "unavailable";
  readonly category: "official-flow-unavailable";
  readonly classification: "official-flow-absent";
  readonly classificationHash: `sha256:${string}`;
  readonly sourceEventIds: readonly `evt_${string}`[];
  readonly idempotencyKey: `sha256:${string}`;
  readonly observedAt: string;
}
```

The outer event context is fixed to the resident agent actor, uses the
classification's causation event, and carries a secret-safe correlation ID.
The event is advisory evidence. It grants no provider transfer, tool approval,
workspace authority, task completion, or accepted ontology mutation. Task139
and every invocation consumer must still recompute current policy, credential,
approval, mount, and provider posture.

No raw secret, locator, endpoint, command, prompt, evidence byte, provider
response, provider error, cookie, token, header, or environment value is an
allowed field.

### Mounted recorder

`packages/local-runtime/src/mounted-official-flow-feasibility.ts` exports one
operation:

```ts
recordMountedOfficialFlowUnavailability({
  operation,
  witness,
  occurredAt,
  correlationId
}): Promise<MountedOfficialFlowFeasibilityResult>
```

The exact result union is:

```ts
type MountedOfficialFlowFeasibilityBlockedCategory =
  | "unsafe-input"
  | "classification-witness-invalid"
  | "source-evidence-missing"
  | "source-evidence-mismatch"
  | "mounted-authority-stale"
  | "concurrency-conflict"
  | "persistence-unconfirmed"
  | "record-conflict";

type MountedOfficialFlowFeasibilityRetry<C extends MountedOfficialFlowFeasibilityBlockedCategory> =
  C extends "unsafe-input" | "classification-witness-invalid" | "record-conflict"
    ? "none"
    : C extends "source-evidence-missing" | "source-evidence-mismatch"
      ? "after-source-repair"
      : C extends "mounted-authority-stale"
        ? "after-remount"
        : "after-ledger-refresh";

type MountedOfficialFlowFeasibilityResult =
  | {
      readonly kind: "unavailable";
      readonly category: "official-flow-unavailable";
      readonly eventId: `evt_${string}`;
      readonly sequence: number;
      readonly idempotencyKey: `sha256:${string}`;
      readonly providerId: `provider_${string}`;
      readonly modelId: string;
      readonly capabilityHash: `sha256:${string}`;
      readonly safeDiagnosticCodes: readonly ["official-flow-unavailable"];
    }
  | {
      [C in MountedOfficialFlowFeasibilityBlockedCategory]: {
        readonly kind: "blocked";
        readonly category: C;
        readonly retry: MountedOfficialFlowFeasibilityRetry<C>;
        readonly safeDiagnosticCodes: readonly [C];
      }
    }[MountedOfficialFlowFeasibilityBlockedCategory];
```

The blocked mapping is fixed: unsafe input, invalid witness, and record conflict
use `none`; missing or mismatched source evidence uses `after-source-repair`;
stale mounted authority uses `after-remount`; concurrency conflict and
unconfirmed persistence use `after-ledger-refresh`. Boundary, ledger, and
currentness failures are converted to this union and never expose a raw error.

The input is normalized once before any `await`. The recorder then performs
these exact stages:

1. Inspect the exact `MountedArtifactAuthorityOperation` through a new
   bridge-specific private inspection seam. Obtain only its current snapshot
   and the factory-captured mounted ledger.
2. Inspect the exact WeakMap-backed witness and require classification
   workspace, mount, policy version, resident, and
   provider bindings to match the mounted snapshot. Mounted policy digest,
   lock digest, authority IDs, admission generation, and high-water facts come
   only from the operation, never from the classifier.
3. Read the mounted ledger once. Require every classification source event to
   exist and require the causation event to be one of them. The causation event
   must be `agent.task.orchestration.checkpointed` with
   `checkpointKind: "prompt-bound"`, exact task/attempt/run, and an exact
   provider posture: provider ID, `modelFamily === modelId`, credential ref and
   kind, selection-policy version, `provider-byte-transfer` approval profile
   and required class, and `capabilityIds` equal to the canonical sequence
   consisting of `capabilityHash`, `officialFlowId`, then one
   `scope:<normalized-scope>` entry per normalized capability scope. Its
   approval requirement preview hash must equal the
   classification approval binding hash. Its prompt-binding receipt approval
   event must occur in the classification sources.
4. Require that named approval event to be an `agent.tool.approved` event on
   the checkpoint's tool-request stream, authored in human context, with
   `approvalClass: "provider-byte-transfer"`, matching tool request ID, and
   `approvedPreviewHash` equal to both the checkpoint and classification
   binding. Its `approvedBy` must equal the human context actor ID. Require
   every checkpoint source event ID to occur in the
   classification source set. Mere source presence is never approval proof.
5. Reinspect the operation after the read. A stale, closed, invalidated,
   mismatched, or burned operation stops before append.
6. Compute the idempotency hash from classification hash plus exact mounted
   authority, policy-lock, and admission bindings. If an exact prior event is
   already present, reread and return it. If the same key has different
   bindings, fail closed.
7. Append one strict event with `expectedGlobalEventCount`. On
   `ConcurrencyConflictError`, perform exactly one additional `readAll`. If it
   contains the exact expected event, continue to exact stream readback;
   otherwise return blocked `concurrency-conflict`. Never re-append inside the
   call and never start a retry loop.
8. Reinspect the operation, read the exact stream, find the committed event by
   assigned event ID, and compare its complete context and payload to the
   canonical expected record.
9. Reinspect the operation once more. Only then return `kind: "unavailable"`
   with the committed event ID, sequence, idempotency key, provider/model, and
   capability hash.

The readback proof is the exact canonical event returned from the authoritative
ledger stream. The design does not invent a second synthetic readback event or
accept an event-shaped service return as proof.

Append success followed by readback failure returns a safe blocked category.
A later identical retry may recover by finding and validating the committed
event. Swapped source events, stale currentness, duplicate-key disagreement,
accessor-backed data, post-await mutation, copied operations or witnesses,
closed runtime, wrong workspace/mount/policy, forged classifier output,
checkpoint/provider/approval disagreement, and non-mounted handles all fail
closed. Raw errors are never returned or serialized.

The idempotency-key preimage is the UTF-8 bytes of `JSON.stringify` over one
ordinary object in this exact order:

```ts
{
  schemaVersion: "agent-provider-feasibility-idempotency.v1",
  classificationHash,
  workspaceId,
  mountInstanceId,
  admissionGenerationId,
  workspaceIdentityEventId,
  mountEvidenceId,
  authorityEvidenceId,
  ledgerStoreEvidenceId,
  policyVersion,
  policyDigest,
  lockStateDigest,
  highWaterMark,
  highWaterOrdinal
}
```

Its frozen vector, using the classification vector above, is:

```text
JSON: {"schemaVersion":"agent-provider-feasibility-idempotency.v1","classificationHash":"sha256:bdae51eff3aedbc86bdec0de666fde4019fc6f920ae23ba09ac06211fa9eb8b6","workspaceId":"ws_review","mountInstanceId":"mount_review","admissionGenerationId":"admission_review","workspaceIdentityEventId":"evt_workspace_review","mountEvidenceId":"mount_evidence_review","authorityEvidenceId":"authority_evidence_review","ledgerStoreEvidenceId":"ledger_store_evidence_review","policyVersion":"policy_review.v1","policyDigest":"sha256:policy_review","lockStateDigest":"sha256:lock_review","highWaterMark":"hwm_review","highWaterOrdinal":7}
SHA-256: sha256:91c31db4ab3a77ef41b43b0f9237c53cf0614ca861349ca98669af6dc5abaaca
```

### Harness responsibilities after recovery

Task129 and Task130 become pure provider-specific classifiers:

- normalize one exact current posture and one assessment;
- require `causationEventId` as a strict posture field and require it to occur
  in the normalized `sourceEventIds` set;
- reject every prohibited or unofficial credential source already named in
  their frozen tests;
- call `createOfficialFlowAbsenceWitness` and return the exact opaque witness
  when `officialFlow` is absent;
- retain Codex's explicit interface-only test result without claiming actual
  feasibility;
- never accept an append callback, mounted owner, authority operation,
  ledger, runtime handle, or storage port; and
- never return `kind: "unavailable"` themselves.

The mounted recorder is the only component in this slice that can turn the
absence witness into a durable unavailable result. Task139 must later compose
the harness from a current `prompt-bound` checkpoint; it may not manufacture a
replacement posture or bypass the checkpoint/approval semantic checks.

The exact post-recovery result unions are:

```ts
type OfficialFlowClassifierBlockedCategory =
  | "unsafe-input"
  | "posture-mismatch"
  | "prohibited-credential-source";

type OfficialFlowClassifierBlocked = {
  [C in OfficialFlowClassifierBlockedCategory]: {
    readonly kind: "blocked";
    readonly category: C;
    readonly providerId: string;
    readonly modelId: string;
    readonly capabilityHash: string;
    readonly safeDiagnosticCodes: readonly [C];
  }
}[OfficialFlowClassifierBlockedCategory];

type CodexSubscriptionHarnessResult =
  | {
      readonly kind: "official-flow-absence-classified";
      readonly category: "official-flow-absent";
      readonly witness: OfficialFlowAbsenceWitnessV1;
    }
  | {
      readonly kind: "interface-demonstrated";
      readonly category: "official-flow-interface-only";
      readonly actualCodexFeasibility: false;
      readonly providerId: string;
      readonly modelId: string;
      readonly capabilityHash: string;
      readonly safeDiagnosticCodes: readonly ["official-flow-interface-only"];
    }
  | OfficialFlowClassifierBlocked;

type XaiSubscriptionHarnessResult =
  | {
      readonly kind: "official-flow-absence-classified";
      readonly category: "official-flow-absent";
      readonly witness: OfficialFlowAbsenceWitnessV1;
    }
  | OfficialFlowClassifierBlocked;
```

The blocked parser returns its exact category as the sole diagnostic code.
`feasibility-append-unavailable` is removed because neither pure classifier has
an append or mounted-authority responsibility.

## Task137 Boundary Versioning

The protected-import model remains finite. The only grammar change is one new
authorized local-runtime owner and one exact named inspection symbol:

```text
packages/local-runtime/src/mounted-official-flow-feasibility.ts
  -> inspectMountedArtifactAuthorityOperationForMountedOfficialFlowFeasibility
  -> packages/local-runtime/src/mounted-artifact-authority-operation.ts
```

`task137-authority-import-grammar.v2` permits that direct static named ESM
import. All aliases, namespace/default imports, re-exports, import queries,
dynamic imports, CommonJS loaders, evaluator forms, unauthorized owners, and
wrong-role symbols remain prohibited by the existing coarse policy.

`task137-authority-import-corpus.v2` keeps exactly eight accepted fixtures and
twenty rejected mutations. The authorized-consumer fixture now contains both
the portable handoff store and mounted feasibility bridge. The unauthorized-
owner mutation targets the new inspection symbol from an agent-package file.
All other categories and the terminal marker remain unchanged:

```text
TASK137_POLICY_CORPUS_OK allowed=8 rejected=20
```

This is a versioned owner-map amendment, not a new language-analysis project.
Reviewers may not add new syntax categories during candidate review.

## Task136 Release Graph V2

The immutable contract becomes `task136-bounded-assurance.v2` with
`task136-release-graph.v2`. The composition grammar and both frozen
composition/ABI corpora remain v1 byte-for-byte. The strict mutable record
schema remains `task136-dispatch-release.v4`.

The exact 29-card order and prerequisites are:

1. `Task126`
2. `Task127`
3. `Task128`
4. `Task135D`
5. `Task137A` <- `Task135D`
6. `Task129-MFA` <- `Task137A`
7. `Task129` <- `Task129-MFA`
8. `Task130` <- `Task129-MFA`
9. `Task135B` <- `Task129-MFA`
10. `T120-R`
11. `Task137B-W` <- `Task135B`, `T120-R`
12. `W1-123-H-SHARED-SCHEMA`
13. `W1-133.5-PREAPPROVAL-PROMPT-STORE`
14. `CF1-HR` <- `W1-123-H-SHARED-SCHEMA`,
    `W1-133.5-PREAPPROVAL-PROMPT-STORE`, `Task137B-W`
15. `Task126-R` <- `Task126`, `Task135D`
16. `Task133` <- `Task126-R`, `Task127`, `Task128`, `Task129`, `Task130`
17. `Task139-P1` <- `Task126-R`, `Task127`, `Task128`, `Task129`, `Task130`,
    `Task133`
18. `Task139-PM` <- `Task126-R`, `Task139-P1`, `Task135D`, `Task137A`,
    `T120-R`
19. `Task136-FC-Core` <- `Task137B-W`, `CF1-HR`, `Task139-PM`, `Task135D`
20. `Task139-P2` <- `T120-R`, `Task139-PM`, `Task136-FC-Core`
21. `Task136-FC-Ports` <- `Task135D`, `Task136-FC-Core`, `Task139-P2`
22. `G136-SC` <- `T120-R`
23. `G136-R` <- `T120-R`, `G136-SC`
24. `C136-P` <- `T120-R`, `Task139-P2`
25. `Task121` <- `CF1-HR`
26. `Task122` <- `CF1-HR`
27. `W1-123-BOOTSTRAP-HANDOFF` <- `CF1-HR`, `Task121`, `Task122`
28. `Task138-H` <- `CF1-HR`, `Task121`, `Task122`,
    `W1-123-BOOTSTRAP-HANDOFF`, `Task135B`, `Task137B-W`
29. `Task136` <- `T120-R`, `Task136-FC-Ports`, `Task139-P2`, `C136-P`,
    `G136-R`, `Task137B-W`, `Task138-H`

The three existing Task126, Task127, and Task128 v4 records stay unchanged and
form the valid v2 prefix. Repository mode must intentionally fail before any
new release work with:

```text
repository release closure incomplete: expected 29 records, found 3
```

### Ownership deltas

`Task137A` retains final ownership of portable lifecycle source/test and its
claim. It transfers these four paths to `Task129-MFA`:

- `packages/local-runtime/src/mounted-artifact-authority-operation.ts`
- `packages/local-runtime/test/mounted-artifact-authority-operation.test.ts`
- `packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts`
- `packages/local-runtime/test/support/task137-authority-boundary-policy.ts`

`Task129-MFA` is final owner of those paths plus:

- `packages/agent/src/official-flow-feasibility.ts`
- `packages/agent/test/official-flow-feasibility.test.ts`
- `packages/ontology/src/contracts.ts`
- `packages/ontology/test/agent-contracts.test.ts`
- `packages/local-runtime/src/mounted-official-flow-feasibility.ts`
- `packages/local-runtime/test/mounted-official-flow-feasibility.test.ts`
- `docs/agentic/claims/task-129-mfa-mounted-provider-feasibility.md`

Because Task129-MFA is the last graph task in this recovery that changes the
central ontology contract, `Task137B-W` no longer lists
`packages/ontology/src/contracts.ts` as an owned path. It continues to own and
run `packages/ontology/test/resident-wake-contracts.test.ts`; its wake event
behavior is unchanged. Every other card path, disposition, transfer, and
command remains the v1 value.

The `Task129-MFA` command is exactly:

```bash
npm test -- packages/agent/test/official-flow-feasibility.test.ts packages/ontology/test/agent-contracts.test.ts packages/local-runtime/test/mounted-artifact-authority-operation.test.ts packages/local-runtime/test/mounted-artifact-authority-operation-imports.test.ts packages/local-runtime/test/mounted-official-flow-feasibility.test.ts
```

## Release And Review Rules

1. Implement and dual-review the v2 contract/verifier migration first.
2. Re-attest `Task135D` and `Task137A` at one exact post-v2 program revision,
   then append their v4 records in order.
3. Implement, dual-review, integrate, and release `Task129-MFA`.
4. Reconstruct Task129 and Task130 from the exact integrated MFA revision.
   They may implement in parallel but integrate and release in graph order.
5. Stop this recovery at the next unreleased card, `Task135B`. Task139 stays
   blocked until all 29 records and Task136 repository mode pass.

Every implementation prompt must explicitly approve task-scoped
`superpowers:subagent-driven-development` when relevant. Design, planning,
audit, and review prompts do not authorize it. Every candidate receives one
fresh architecture/invariant review and one fresh executability/adversarial
review bound to the same immutable SHA.

## Acceptance

This recovery is complete when:

- the immutable v2 contract and checker report 29 graph records and 29 command
  cards while retaining the v1 1/20 composition and 1/15 ABI corpora;
- repository mode sees the three unchanged prefix records and fails with the
  exact 29/3 closure message before new releases;
- Task135D and Task137A have valid v4 records under v2;
- the ontology accepts only strict provider-feasibility events on the exact
  stream and rejects unsafe, mismatched, human-authored, or secret-bearing
  variants;
- the shared classifier accepts the two equal normalized postures plus an
  absent official flow, emits the frozen classification vector, and copied,
  serialized, fabricated, cross-family, or posture-mismatched witnesses fail;
- the mounted recorder proves append, exact readback, idempotent retry,
  one-reread concurrency handling, and post-await currentness for both provider
  families;
- copied, stale, closed, forged, non-mounted, cross-workspace, cross-mount,
  cross-policy, mismatched-source, non-`prompt-bound` causation, swapped
  approval, hostile-object, and no-op evidence paths cannot return unavailable;
- the classification and idempotency hash functions reproduce both frozen
  JSON/SHA-256 vectors byte-for-byte;
- Task137 grammar/corpus v2 passes the unchanged 8/20 marker and authorizes
  only the new direct static named bridge import;
- Task129 and Task130 are pure classifiers with no persistence or authority
  port and fresh post-MFA ancestry/reviews; and
- strict v4 records are valid through Task130 while Task135B is the next finite
  frontier and Task139 remains closed.
