# Resident Agent Provider and Credentials Design

Date: 2026-07-12

## Purpose

This Lane P Wave 0A specification defines provider and credential boundaries
for one Cestus resident. It covers generic OpenAI-compatible BYOK, OS secret
storage, a deliberately selected local model, the required Nous reference
provider, and Codex/xAI feasibility using only official non-extractive flows.
Providers, harnesses, subscriptions, model names, credentials, and local
engines are execution backends, never resident identities or authority sources.

This is a contract proposal for CF-1, not an implementation. Task 106 creates
no secret, calls no provider, moves no prompt/evidence bytes, and makes no
claim that a Codex or xAI subscription flow is currently feasible.

## Scope, Ownership, And Non-Canonical Boundaries

Lane P owns the future provider-capability, credential-reference, secret-store,
provider-feasibility, and shared provider-configuration contracts. Its later
implementation work is Tasks 126--130 and 139. This task authorizes none of
those tasks, no provider probe, no OS-secret write, and no config edit.

All interfaces, enum values, and event names below are **non-canonical/pre-CF-1
proposals**. They do not replace or loosen existing interfaces in
`packages/agent/src/provider.ts`, `packages/agent/src/provider-registry.ts`,
`packages/agent/src/secret-store.ts`, or local-runtime readiness. CF-1 must
choose exact Zod schemas, parser identities, canonical serialization, event
versions, idempotency keys, compatibility/migration rules, and one production
file owner. Before then, an implementation uses approved existing contracts or
fails closed; this design is not an API.

| Concern | P owns/proposes after CF-1 | Not P-owned |
| --- | --- | --- |
| Provider posture | Capabilities, `CredentialReference`, OS secret resolution, feasibility records, shared configuration. | Resident bootstrap, workspace lifecycle, default runtime factory. |
| Run choice | Secret-safe policy/readiness input for an exact run. | Prompt rendering, specialist dispatch, loop policy/budgets, task claims. |
| Remote transfer | Exact provider/model/ref posture and adapter boundary. | Human approval decision/consumption or domain-effect execution. |
| Persistence | Provider provenance and safe feasibility evidence. | Ledger/store implementation, handoff semantics, terminal task rules, browser parsing. |
| Acceptance | Deterministic provider requirements and Nous-gate requirements. | Acceptance-matrix ownership or live credential use during Task 106. |

W owns mount identity/revalidation and disconnects; R alone composes the
default runtime factory; L owns bounded-loop budgets/permissions; H owns
durable handoff material, manifest, and readback; U owns browser DTO parsing;
and A owns integrated acceptance. P must not create an alternate runtime,
handoff store, cockpit action, policy executor, or shared event schema before
the coordinator freezes ownership.

## Resident Identity And Mounted-Workspace Authority

`agent_default` is the only resident identity. A provider, model, API key,
OAuth grant, subscription, harness, endpoint, credential reference, or local
engine cannot gain workspace, ledger, tool, approval, or task authority.

Every readiness check, secret resolution, provider invocation, feasibility
append, output write, and recovery is bound to the verified mounted workspace:
workspace ID, mount instance, resident identity, task/attempt/run, policy,
locks, projection high-water marks, and operation-specific source/context
hashes must agree. An object/reference from another workspace, mount, run,
provider, model, policy, or capability version is unusable.

On disconnect, unreadable mount, or identity mismatch, the provider path stops
before secret resolution and before network I/O. It may retain bounded,
secret-safe ephemeral diagnostics and, only if the mounted ledger remains
authoritative/writable, append existing resumable/blocked lifecycle evidence.
It writes **no fallback** ledger, projection, prompt, artifact, derivative,
handoff, secret, cache, temporary-file, or alternate-workspace state. Remount
uses ordinary claim recovery after new identity/policy/lock/high-water checks;
it never continues from cached secret, prompt, or provider output.

## Provider Policy And Readiness

Policy selects one exact capability for one exact run. It is not a ranking
helper: it may not silently replace an unavailable remote selection with BYOK,
a local model, another model/account/credential, provider family, or harness.
A local model runs only when explicitly selected by the policy and descriptor.

Before a call, the evaluator freezes and validates plain own-data input with:

- `agent_default`, workspace/mount, task/attempt/run/run-type, workflow hash;
- provider/model, adapter/capability version/hash, endpoint-policy identity,
  modality and output contract;
- typed credential reference/kind/status/scopes, OS-secret health, and
  provider/model/reference match;
- prompt artifact hash, context/source/artifact hashes, data-transfer class,
  remote byte categories/count, and allowed budgets;
- policy version, cost/request/input/output budgets, locks, approval class;
  and
- causation, provenance, and projection/read-model freshness bindings.

The result is a frozen secret-safe value:

| Outcome | Meaning and permitted action |
| --- | --- |
| `invocation-ready` | An exact current capability is policy-permitted. Remote use still goes only through separately approved transfer consumption. |
| `waiting-for-approval` | Feasible, but exact current approval is absent. Existing gateway may create/observe an approval request; no secret resolution or call. |
| `unavailable` | No policy-permitted capability is usable, including an official harness without an official flow. Persist safe evidence only with mounted authority. |
| `blocked` | Authority, lock, provenance, budget, policy, reference, or secret-safety validation failed. Do not probe, substitute, or invoke. |

Readiness is a current observation, not durable authority. It is recomputed at
invocation consumption; an old readiness DTO cannot be reused after a bound
fact changes. The adapter can validate more strictly but cannot self-approve,
create approval, broaden provider/model/ref/budget/data policy, lower an
approval class, or make an unavailable flow executable.

### Independent approval consumption

Remote prompt/evidence transfer uses the existing `provider-byte-transfer`
approval gateway. Its exact preview binds task/attempt/run, resident,
workspace/mount, provider/model/capability, credential-reference ID/kind,
prompt artifact hash, context/evidence hashes/categories, byte budget, policy,
and transfer class. It never contains prompt text, evidence bytes, credential
values, headers, endpoints, cookies, or raw provider responses.

At consumption, the independent approval reader rechecks human actor, class,
preview hash, causation/provenance, prompt/context/source hashes, current
capability/ref health, workspace/mount, policy/budget/locks, and terminal or
conflicting run state. The adapter is not that reader. Stale, forged,
cross-run/provider, revoked, expired, or mismatched approval is
`blocked`/`waiting-for-approval`, not an excuse to consume an old approval
because secret material still resolves.

## Credential References And OS Secret Resolution

A workspace may persist a typed, secret-free `CredentialReference`. Secret
material exists only in an operator-selected OS secret facility. The reference
is provenance/policy metadata, not a secret locator, token surrogate, or grant.

```ts
// Proposal only; non-canonical until CF-1 freezes schema and event binding.
interface CredentialReference {
  readonly schemaVersion: "agent-credential-reference.v2";
  readonly credentialRefId: `agent_credref_${string}`;
  readonly providerId: `provider_${string}`;
  readonly credentialKind:
    | "api-key-bearer" | "workload-identity-token" | "subscription-oauth"
    | "device-code-oauth" | "local-no-secret" | "mtls-certificate"
    | "enterprise-gateway";
  readonly scopeKind: "machine" | "user" | "workspace" | "organization" | "enterprise";
  readonly capabilityScopes: readonly ("model-inference" | "provider-health" | "provider-parse" | "harness-execution")[];
  readonly safeLabel: string;
  readonly status: "linked" | "missing-binding" | "healthy" | "expired" | "revoked" | "insufficient-scope" | "unverified";
  readonly policyVersion: string;
  readonly authorizedByActorId: string;
  readonly authorizedAt: string;
  readonly expiresAt?: string;
  readonly rotationDueAt?: string;
  readonly revokedAt?: string;
  readonly sourceEventIds: readonly string[];
}

interface OsSecretResolutionRequest {
  readonly credentialRef: CredentialReference;
  readonly providerCapabilityHash: `sha256:${string}`;
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly runId: string;
  readonly purpose: "model-inference" | "provider-health" | "harness-execution";
}

interface OsSecretResolution {
  readonly kind: "resolved" | "unavailable" | "blocked";
  readonly health: "healthy" | "missing-binding" | "expired" | "revoked" | "insufficient-scope" | "unverified";
  readonly safeDiagnosticCodes: readonly string[];
  readonly material?: OpaqueSecretMaterial;
}

interface OsSecretStore {
  resolveForExactUse(input: OsSecretResolutionRequest): Promise<OsSecretResolution>;
}
```

`OpaqueSecretMaterial` is process-local, non-serializable, non-loggable,
non-cloneable, and short-lived. Only the selected adapter may use it for the
immediate authenticated request. It cannot occur in an event, artifact,
projection, DTO, exception, string interpolation, config file, shell argument,
browser state, test fixture, or feasibility record. The store returns health
and categorized failure, never printable material; adapters release ephemeral
request material promptly and keep rejected errors safe.

BYOK onboarding writes operator-supplied material directly to the OS secret
facility outside the workspace, validates provider policy, then appends or
supersedes only a secret-free reference. Rotation, revocation, and correction
append new events. Portable state records no OS keychain locator, environment
variable, path, username, endpoint query, certificate body, secret value, or
derived secret hash.

The concrete OS backend uses a supported platform facility and fails closed
when locked, unsupported, unavailable, or invalid. It never falls back to
`.env`, plaintext config, CLI auth store, browser store, process-memory
persistence, workspace artifact, or database table. Test-only fakes may exist
only in credential-free deterministic tests and are never production-selected.

## Provider Capability Contracts

The frozen registry has immutable capability descriptors and separate current
feasibility records. A descriptor says what a versioned adapter supports; it
does not prove credential presence or approve remote data transfer.

```ts
// Proposal only; CF-1 selects exact schema/version names.
interface ProviderCapability {
  readonly capabilityVersion: "agent-provider-capability.v2";
  readonly providerId: `provider_${string}`;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly capabilityHash: `sha256:${string}`;
  readonly backendKind: "openai-compatible-api" | "local-engine" | "openai-codex-harness" | "xai-harness" | "enterprise-gateway";
  readonly modelIds: readonly string[];
  readonly modalities: readonly ("text" | "image" | "audio" | "file" | "code" | "embedding")[];
  readonly structuredOutput: "unsupported" | "json-mode" | "schema-strict" | "harness-mediated";
  readonly toolSupport: "none" | "function-calling" | "hosted-tools" | "harness-tools";
  readonly inputLimit: number;
  readonly outputLimit: number;
  readonly credentialRequirements: readonly { readonly kind: CredentialReference["credentialKind"]; readonly required: boolean; }[];
  readonly dataHandlingPosture: "local-only" | "remote-prompt-byte-transfer-gated" | "remote-workspace-harness-gated";
  readonly costPolicy: "local-compute" | "metered-api" | "subscription-entitlement" | "org-managed" | "unknown-until-configured";
  readonly approvalProfile: "local-only" | "remote-prompt-only" | "remote-byte-transfer-gated" | "harness-workspace-gated";
  readonly diagnosticContract: readonly string[];
}

interface ProviderFeasibilityRecord {
  readonly recordVersion: "agent-provider-feasibility.v1";
  readonly recordId: string;
  readonly providerId: `provider_${string}`;
  readonly modelId?: string;
  readonly capabilityHash: `sha256:${string}`;
  readonly credentialRefId?: `agent_credref_${string}`;
  readonly posture: "feasible" | "unavailable" | "blocked" | "not-applicable";
  readonly category: string;
  readonly policyVersion: string;
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly observedAt: string;
  readonly sourceEventIds: readonly string[];
  readonly causationId?: string;
  readonly safeEvidenceHashes: readonly `sha256:${string}`[];
  readonly supersedesRecordId?: string;
}
```

Descriptors/references/records normalize plain own-data and freeze before
append, write, call, or `await`. Every string passes structural secret-safety;
free-form provider error text is never a record field. Existing pre-CF-1
parsers stay distinct until an explicit migration; no compatibility parser is
aliased to this proposal just to let a consumer compile.

Feasibility is append-only evidence. A probe, revocation, official-flow
success, policy change, or correction appends a causally linked/superseding
record. Projections rebuild current safe posture from ledger evidence plus a
fresh local health observation. A record cannot manufacture readiness or keep
old health across ref rotation/revocation, mount change, or policy change.

## Audited Prompt And Provider-Byte Boundary

The `PromptArtifactEnvelope`/typed `inputText` boundary is the only remote
input path. R owns rendering/exact run binding; P owns policy/capability/ref
posture. P does not render prompts or recover text from a hash.

Before an adapter receives typed `inputText`, runtime proves that:

1. mounted authority, `agent_default`, task/attempt/run, workflow,
   template/renderer/output-schema versions, context/source hashes, provider
   posture, policy, and locks agree;
2. the artifact is production, has `provider-approved` safety, and has the
   same prompt hash named by the transfer preview;
3. remote prompt/evidence byte category and budget are policy/capability
   permitted; and
4. required independent human approval passes consumption revalidation.

The adapter receives only verified typed `inputText` and selected opaque secret
material for that invocation. It rejects raw hash-to-text resolvers,
caller-supplied prompts, placeholders, broader evidence readers, arbitrary
URLs/request objects, or an approval object as proof. Provider/model/ref/run
mismatch fails before network I/O.

Prompt text, raw evidence, headers, authorization values, raw provider
responses, reasoning payloads, and endpoint config never occur in ledger
payloads, manifests, approvals, DTOs, diagnostics, tests, or ordinary logs.
Provenance carries only safe IDs/versions/hashes/byte counts/categories,
provider/model IDs, approval/event IDs, outcome category, and artifact refs.
Workflow output is retained only through its normal mounted artifact and
H-owned durable-handoff lifecycle; a model response/hash is not task success.

## Provider-Specific Feasibility

All backends retain mounted-authority, budget, provenance, and approval rules.
This table declares product posture, not Task 106 permission to contact one.

| Backend | Required posture | Credential/transfer rule | Feasibility result |
| --- | --- | --- | --- |
| Generic OpenAI-compatible BYOK | Explicit provider/model/adapter/endpoint-policy; advertised response/tool/schema features match capability. | Operator writes API material to OS storage; workspace holds typed ref only; remote bytes are approval-gated. | Mismatch/absent ref/unsupported endpoint is blocked or unavailable, never generic fallback. |
| OS secret storage | Operator-selected machine-local OS facility bound to typed reference. | Material resolves only for exact selected use and stays outside workspace. | Locked/missing/revoked/unsupported binding returns safe health, no plaintext fallback. |
| Local model | Explicit `local-engine`, configured model/local reachability/feature posture, local-compute budget, and policy selection. | Normally `local-no-secret`; a local gateway credential uses the same OS-ref contract. | Stopped/incompatible/policy-blocked engine is unavailable; it never replaces remote implicitly. |
| Nous | Mandatory reference provider for provider-bearing acceptance; selected model meets workflow contract. | Real approved credential comes from coordinator-controlled OS secret storage; remote bytes use exact approval. | Outage/missing binding creates safe resumable/unavailable evidence, never a fabricated pass. |
| Codex subscription harness | Only officially documented supported non-extractive capability/authorization route. | `subscription-oauth`/`device-code-oauth` only through OS storage and approved harness-workspace boundary. | No official flow appends secret-safe unavailable feasibility; it does not block Nous/BYOK/local. |
| xAI subscription harness | Same official-flow discipline with its own provider semantics/capability. | Only official non-extractive route and exact policy/approval posture. | Unavailable official support is visible limitation, never emulated through API key/another provider. |

"Official" excludes browser cookies/storage, session data, CLI-auth-store files,
token caches, process environments outside the OS-secret adapter, undocumented
APIs, intercepted headers, reverse-engineered device grants, and unofficial
token extraction. No Codex/xAI subscription credential is a general API key.
The feasibility adapter stops with safe unavailable evidence before it would
need any unofficial token.

## Diagnostics, Provenance, And Durable Handoffs

Readiness/diagnostics are structured, bounded, and secret-safe: safe
provider/model IDs, capability hash/version, status/category, approval class,
credential-health category, action IDs, timestamps, counts, and safe related
event IDs. Browser-safe output omits raw reference detail by default and always
omits material, OS facility names/paths, endpoints, headers, commands, raw
errors, prompts/evidence, provider output, stack traces, and getter-backed
values.

The frozen vocabulary includes at least `workspace-unavailable`,
`mount-identity-mismatch`, `policy-blocked`, `credential-binding-missing`,
`credential-expired`, `credential-revoked`, `credential-insufficient-scope`,
`secret-store-unavailable`, `provider-unavailable`, `harness-not-installed`,
`official-flow-unavailable`, `provider-capability-mismatch`,
`approval-required`, `approval-stale`, `prompt-binding-invalid`,
`budget-exhausted`, `provider-output-invalid`, and `secret-safety-rejection`.
Categories never contain raw provider text.

Candidate events (feasibility-observed, invocation-prepared/completed/failed)
must bind exact task/attempt/run, resident, provider/model/capability,
credential-reference, prompt/artifact, policy, approval, source, causation,
correlation, and outcome category. CF-1 decides event reuse/versioning. In all
cases the ledger stays append-only; corrections/retries/revocations append new
events and projections rebuild rather than becoming hidden mutable truth.

After provider output, H governs durability: exact mounted material/manifest
write/readback binds invocation/prompt/context/source/approval IDs/hashes,
then handoff lifecycle events replay/read back, then a compatible task
transition may occur. Provider success, output hash, readiness card, or
feasibility record is not terminal evidence. Disconnect/missing readback,
swapped source/stale approval, or secret-safety failure remains blocked or
resumable and never synthesizes a handoff.

## Acceptance And Verification

Later deterministic tests are credential-free. Test fakes/material remain
inside the test process and production configuration must reject them.

| Area | Required credential-free proof |
| --- | --- |
| Typed refs | Reject literal/secret-shaped values, prototypes/accessors, absent/stale events, provider/model/ref mismatch, bad scopes, rotation/revocation reuse, cross-workspace/run refs. |
| OS boundary | Resolve exact valid refs; safe missing/expired/revoked/unavailable categories; no material/locator serialization; reject environment/config/browser/CLI/workspace fallbacks. |
| BYOK/local | Verify descriptor/policy/budget/readiness parity and prove local model is never implicit fallback. |
| Policy/approval | Reject forged/stale/swapped approval, changed policy/capability/context/prompt/source, locks/budgets, and adapter self-approval/broadened transfer. |
| Prompt boundary | Reject raw resolver/placeholder/unverified input, wrong artifact, changed run/provider/model/ref, unsafe text, and transfer before approval. |
| Feasibility/DTOs | Replay superseding records/provenance; prove JSON/errors/logs/DTOs leak no secret, raw location/body, prompt, evidence, header, or command path. |
| Handoff | Require mounted material/manifest readback; prove provider success cannot complete task and disconnect creates no fallback store. |
| Harnesses | Prove absent Codex/xAI official flow creates safe unavailable evidence, never cookie/session/CLI-auth-store/token extraction. |

The live-provider acceptance is outside deterministic suites and runs only in a
coordinator-controlled environment with a real approved Nous credential in OS
secret storage. The required reference gate is future `npm run agent:nous:smoke`
(or its explicitly frozen successor), not an emulated
provider. It uses verified mounted storage, a bounded advisory workflow, exact
policy, independent approved remote-byte-transfer preview, real approved Nous,
append-only invocation/approval evidence, and a fresh-process durable handoff
readback.

Recorded live output is limited to status marker, provider/model IDs,
capability/prompt/input/output/manifest hashes, safe event IDs, context-pack
IDs, counts, categories, and readback marker. It records no credential/ref
details, prompt, evidence, endpoint, raw response, or output body. Missing
provider/OS binding, failed approval revalidation, or outage is an honest
blocked/unavailable result, never a deterministic pass. Nous remains mandatory
even if BYOK/local/Codex/xAI feasibility exists.

## Deferred Decisions And Stop Conditions

CF-1 settles canonical schemas/events, ID grammar, hashes, OS backends,
endpoint-policy storage, local discovery, official Codex/xAI evidence,
browser DTO ownership, and compatibility migration. It must preserve this
fail-closed posture and cannot silently change another lane's owner.

Stop and escalate on shared event/DTO/ownership conflict; any unofficial token,
cookie/browser/session/CLI-store extraction; secret leak/plaintext fallback;
mount mismatch; unbound/stale/swapped prompt, source, artifact, reference, or
approval; missing durable readback; provider-as-identity attempt; unavailable
mandatory Nous gate; data-loss risk; or two focused verifier failures. No
newsroom/team scope, multi-user authorization, shared hosting, or autonomous
external effect is introduced.

This Task 106 artifact stops for fresh review and written coordinator Lane P
specification approval. It grants no Task 114 plan, implementation, credential
provisioning, provider invocation, registry change, or merge into `neo`.
