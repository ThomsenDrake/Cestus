# Resident Agent Provider/Auth and Secret-Store Design

Date: 2026-07-07

## Purpose

This design defines the live provider, authentication, and secret-store layer for
the resident Cestus Agent. The resident agent remains the workspace
orchestrator. OpenAI, OpenAI Codex local workflows, xAI, BYOK
OpenAI-compatible endpoints, local models, and future enterprise gateways are
execution backends only. No provider account, subscription, OAuth session,
command-line harness, local model process, access token, or API key becomes the
Cestus resident agent identity.

The design extends the resident-agent foundation with a typed provider
capability registry, credential references, secret-store boundaries, provider
readiness diagnostics, and browser-safe setup cards. It preserves:

- append-only ledger semantics
- provenance and projection rebuildability
- provider byte-transfer approval gates
- secret-safe diagnostics
- local-first solo mode
- portable external-drive workspaces
- a path to small-team and enterprise operation
- AI-legible contracts for generic coding agents

## Goals

- Model providers as interchangeable execution backends under Cestus policy.
- Represent credentials as secret-free references and health/readiness state.
- Keep all secret material out of ledger events, portable workspace manifests,
  tracked docs, browser DTOs, diagnostics, model prompts, reports, factory
  claims, and agent memory.
- Support these credential kinds: `api-key-bearer`,
  `workload-identity-token`, `subscription-oauth`, `device-code-oauth`,
  `local-no-secret`, `mtls-certificate`, and `enterprise-gateway`.
- Give operators friendly capability cards and diagnostics such as
  `works-locally`, `needs-api-key`, `needs-device-sign-in`,
  `not-available-for-task`, and `requires-byte-transfer-approval`.
- Make provider selection policy-driven and testable with fake providers.
- Keep live OpenAI and xAI calls out of standard verification until secret-store
  and contract tests are solid.

## Non-Goals

- Building live OpenAI, xAI, BYOK, local-model, or enterprise-gateway adapters
  in this design slice.
- Designing a generic OAuth bridge that converts consumer subscriptions into
  arbitrary API credentials.
- Scraping browser tokens, CLI auth files, cookies, local storage, or provider
  session databases.
- Storing provider secret material in portable ontology state or external-drive
  workspace metadata.
- Allowing the resident agent to approve its own provider byte transfer,
  external sends, legal escalation, export, destructive repair, or accepted
  graph truth.
- Treating the OpenAI Codex product identity, an xAI subscription identity, or a
  local harness identity as the Cestus resident agent.

## Existing Local Context

The current repo already has the boundary patterns this design should reuse:

- `packages/ingestion/src/provider-adapter.ts` records
  `ingestion.provider.approved` before any provider parse may transfer bytes.
  Approval is distinct from execution, retries are idempotent, and provider
  fields reject credential-shaped text.
- `packages/workspace/src/index.ts` rejects secret-looking keys in portable
  workspace manifests and keeps canonical portable layout secret-free.
- `packages/prr/src/correspondence-adapter.ts` exposes correspondence
  capabilities and `credentialMode` values without serializing credentials.
- `packages/operator-status/src/contracts.ts` rejects secret-shaped text and
  forbids visible commands that would transfer provider bytes, send PRRs,
  approve ontology truth, run repair, or perform irreversible actions.
- The resident-agent foundation plan creates `packages/agent` with fake
  providers, provider descriptors, credential reference IDs, tool approval
  contracts, local runtime DTOs, and browser-safe Agent UI surfaces. The live
  provider/auth work should build on that package after the foundation lands.

## Official Research Basis

Research was checked against official sources on 2026-07-07.

OpenAI:

- [OpenAI API authentication](https://developers.openai.com/api/reference/overview#authentication)
  documents bearer authentication using API keys or short-lived access tokens
  created through workload identity federation. It also says API keys are
  secrets that should be kept out of client-side code and loaded from an
  environment variable or key management service on the server.
- [OpenAI Codex authentication](https://developers.openai.com/codex/auth#openai-authentication)
  separates ChatGPT subscription sign-in from API-key usage. Codex cloud
  requires ChatGPT sign-in; Codex CLI and IDE support both ChatGPT sign-in and
  API-key sign-in.
- [Codex access tokens](https://developers.openai.com/codex/enterprise/access-tokens)
  are ChatGPT access tokens scoped to Codex permissions for trusted local Codex
  automation, currently supported for ChatGPT Business and Enterprise
  workspaces. They are not general OpenAI API credentials.
- [OpenAI workload identity federation for GitHub Actions](https://developers.openai.com/api/docs/guides/workload-identity-federation/github-actions#github-actions-best-practices)
  and [for Microsoft Azure](https://developers.openai.com/api/docs/guides/workload-identity-federation/microsoft-azure#microsoft-azure-best-practices)
  emphasize short-lived exchanges, exact claim matching, separate service
  accounts, and environment-specific identity boundaries.

xAI:

- [xAI Quickstart](https://docs.x.ai/developers/quickstart) starts API use by
  creating an account, generating an API key, and using xAI or OpenAI SDK
  clients.
- [xAI Inference REST API overview](https://docs.x.ai/developers/rest-api-reference/inference)
  says the REST API is compatible with the OpenAI REST API and uses bearer
  authentication with an xAI API key.
- [xAI Accounts and Authorization](https://docs.x.ai/developers/rest-api-reference/management/auth)
  documents API keys as team-bound bearer tokens with ACLs, redacted key
  metadata, expiration, rate limits, rotation, and deletion.
- [xAI CLI reference](https://docs.x.ai/build/cli/reference) documents sign-in
  and device-code authentication for headless or remote environments.
- [Use Grok in OpenCode](https://x.ai/news/grok-opencode),
  [Use Grok in OpenClaw](https://x.ai/news/grok-openclaw), and
  [Connect Grok to Hermes Agent](https://x.ai/news/grok-hermes) document
  subscription OAuth or device-code flows for named local-agent integrations.
  These are integration-specific subscription flows, not generic API
  credentials for arbitrary clients.
- [xAI mTLS Authentication](https://docs.x.ai/developers/advanced-api-usage/mtls)
  documents mTLS as an enterprise feature that adds client-certificate checks
  while still requiring a valid API key.

Design consequence: Cestus supports subscription OAuth only for named,
officially supported harnesses or integrations. It must not generalize those
flows into arbitrary OpenAI-compatible API access unless the provider documents
that path for Cestus or for a stable public protocol Cestus can implement.

## Design Approaches

### Recommended: Credential References Plus Provider Registry

Cestus records provider capabilities and secret-free credential references in
append-only events or safe local configuration. A runtime-only secret store
resolves those references into secret material. Provider health and setup cards
are DTOs derived from the registry, secret-store binding status, policy, and
fake or live checks.

Tradeoffs:

- Best preserves ledger and portable workspace safety.
- Works for OpenAI API keys, OpenAI workload identity, xAI API keys, local
  models, BYOK endpoints, mTLS, and enterprise gateways.
- Lets subscription harnesses exist without turning subscription accounts into
  Cestus identity.
- Requires a deliberate setup flow and clear diagnostics when a portable drive
  moves to a machine without the matching local secret binding.

### Rejected: Portable Workspace Stores Provider Config And Secrets

This would put endpoint URLs, credential values, token material, or auth file
paths inside the external-drive workspace. It would be convenient for moving a
drive between machines, but it would violate the portable workspace contract,
increase loss/theft risk, and make the ontology state a secret carrier.

### Limited: Browser Or Harness OAuth As Provider Setup

Browser/device OAuth can be supported only when an official provider product
documents a named flow that Cestus is allowed to use. The token remains in that
product's auth store or in Cestus's secret store. Browser session scraping,
copying another tool's token, or reading a CLI auth database is forbidden.

## Core Architecture

The provider/auth layer has six units:

1. Provider capability registry

   Stores safe provider descriptors, adapter versions, capability flags,
   credential requirements, task suitability, cost policy, data-handling notes,
   and workspace scope constraints. Registry entries are secret-free.

2. Credential reference model

   Defines append-only, secret-free references to credential material. A
   credential reference can be workspace-scoped, user-scoped, organization-
   scoped, or machine-scoped. It never contains the secret, the raw environment
   variable name, OAuth tokens, private keys, certificate private-key paths, or
   provider auth-file paths.

3. Secret-store resolver

   Resolves a credential reference to secret material at invocation time. The
   resolver is runtime-local and never serializes secret values. Backends
   include OS keyring, local encrypted store, enterprise secret manager, and an
   explicitly approved process environment mode for local development.

4. Provider adapter runtime

   Executes model or harness calls. It receives a capability-scoped credential
   handle from the resolver, sends approved prompts or bytes, returns output
   artifacts, and redacts provider errors before diagnostics.

5. Policy and approval gateway

   Selects providers, enforces data-sensitivity rules, asks for human approval
   before provider byte transfer, and rejects stale previews.

6. Safe surfaces

   CLI, local runtime, operator status, and browser UI show readiness, setup
   state, safe next actions, and diagnostics without exposing secret material.

## Provider Capability Registry

A provider descriptor is backend metadata only. It must not include resident
agent identity, provider account identity, raw endpoint secrets, token paths, or
credential values.

Required descriptor fields:

- `providerId`: stable safe ID, such as `provider_openai_api_default`.
- `label`: safe human label, such as `OpenAI API`.
- `adapterVersion`: Cestus adapter contract version.
- `backendKind`: `openai-api`, `openai-codex-harness`, `xai-api`,
  `xai-harness`, `openai-compatible-api`, `local-engine`,
  `enterprise-gateway`, or `custom-adapter`.
- `modelFamilies`: safe model family labels or advertised model IDs.
- `modalities`: text, image, audio, file, code, or embedding capability labels.
- `toolSupport`: none, function-calling, hosted-tools, or harness-tools.
- `structuredOutputSupport`: unsupported, json-mode, schema-strict, or
  harness-mediated.
- `contextLimits`: safe numeric limits when known.
- `credentialRequirements`: one or more accepted credential kinds.
- `dataHandlingNotes`: short safe text naming whether bytes leave the machine,
  whether a provider account is involved, and whether provider retention policy
  applies.
- `costPolicy`: `local-compute`, `metered-api`, `subscription-entitlement`,
  `org-managed`, or `unknown-until-configured`.
- `workspaceScopes`: local-only, workspace, user, org, team, or enterprise.
- `approvalProfile`: whether model calls are local-only, remote prompt-only, or
  require provider byte-transfer approval.
- `diagnosticContract`: safe diagnostic category names the adapter may emit.
- `fakeSupport`: deterministic fake adapter available for standard tests.

Provider selection is policy-driven. Selection inputs include task type,
evidence sensitivity, local/offline mode, data transfer class, cost preference,
credential readiness, context size, structured output need, and user or
workspace provider preference. The selected provider never changes the resident
agent identity.

## Credential Reference Model

A credential reference is a durable handle that says what kind of credential is
authorized for which provider and scope. It does not say where the secret lives
in a way that a browser, ledger, tracked doc, or prompt can use.

Safe fields:

- `credentialRefId`
- `providerId`
- `credentialKind`
- `scopeKind`: `machine`, `user`, `workspace`, `organization`, or
  `enterprise`
- `capabilityScopes`: for example `model-inference`, `provider-health`,
  `provider-parse`, or `harness-execution`
- `safeLabel`
- `authorizedBy`
- `authorizedAt`
- `expiresAt` when safe to disclose
- `rotationDueAt` when safe to disclose
- `revokedAt` when safe to disclose
- `status`: `linked`, `missing-binding`, `healthy`, `expired`, `revoked`,
  `insufficient-scope`, or `unverified`
- `policyVersion`
- `sourceEventIds`

Forbidden fields and values:

- API keys
- bearer tokens
- access tokens
- refresh tokens
- client secrets
- device-code secrets
- private keys
- raw certificate private-key paths
- session cookies
- browser auth storage paths
- raw provider auth file paths
- raw environment variable names
- raw provider error messages
- credential-shaped labels or IDs

The secret-store binding for a credential reference is local runtime state. A
portable workspace may carry the credential reference ID and safe status, but
the secret binding must be re-established on each trusted machine or through a
team/enterprise secret manager.

## Credential Kinds

`api-key-bearer`

- Used for OpenAI Platform API keys, xAI API keys, and BYOK
  OpenAI-compatible endpoints that authenticate with bearer API keys.
- Secret value lives in a secret store.
- Ledger may store only the reference ID, safe label, provider ID, kind, scope,
  and safe status.
- Health check may verify the key server-side through a safe low-impact call
  only when the operator explicitly enables live checks.

`workload-identity-token`

- Used for short-lived OpenAI API access tokens created through workload
  identity federation and for future providers with similar support.
- Cestus stores mapping metadata and policy state, not issued tokens.
- Runtime exchanges must be short-lived and tied to exact claims such as
  repository, environment, workflow, service identity, or managed identity.
- Browser DTOs show only whether the mapping is configured and whether a token
  exchange succeeded.

`subscription-oauth`

- Used only for named officially supported product/harness lanes, such as
  Codex ChatGPT sign-in for Codex local workflows or xAI Grok OAuth in a
  documented local-agent integration.
- It is not a general API credential.
- Cestus may invoke a harness adapter only through stable documented product
  entrypoints and must record the output as provider execution metadata.
- Cestus must not read browser sessions or another tool's token store.

`device-code-oauth`

- Used for headless or remote named integrations where the provider officially
  documents device-code sign-in.
- The code and URL are transient setup material and must not be stored in the
  ledger, memory, prompts, diagnostics, or tracked docs.
- Browser DTOs can display a safe action such as `open-device-sign-in`, but the
  raw code should be shown only in the local trusted setup surface.

`local-no-secret`

- Used for deterministic fake providers and local model engines that need no
  remote credential.
- Health checks verify local process availability, model availability, context
  limits, and sandbox policy.
- Local providers are preferred for sensitive evidence when they satisfy the
  task capability requirements.

`mtls-certificate`

- Used as an additional credential layer for providers or gateways that require
  client certificates.
- xAI documents mTLS as an enterprise feature that still requires a valid API
  key. Cestus should therefore model mTLS as a companion requirement, not a
  replacement for `api-key-bearer`.
- Certificate material and private-key paths are secret-store state, never
  browser DTO or ledger fields.

`enterprise-gateway`

- Used when an organization gateway performs credential exchange, auditing,
  policy enforcement, or provider routing.
- Cestus records only a gateway provider ID, safe label, capability contract,
  policy version, and safe status.
- The gateway owns secret material and provider-specific account bindings.

## Provider-Specific Design

### OpenAI API

OpenAI API adapters use `api-key-bearer` or `workload-identity-token`.
Organization and project routing metadata may be represented as safe
configuration only if it does not reveal a secret or internal policy detail.
Browser DTOs should describe billing and data-handling scope in safe terms, not
raw IDs unless a local admin surface explicitly requests them.

OpenAI API calls are live remote model invocations. If a prompt includes private
evidence text, document bytes, source-identifying content, or sensitive
investigation context, the tool gateway must require provider byte-transfer
approval bound to the exact preview hash.

### OpenAI Codex Harness

Codex subscription access belongs to the Codex product lane. Cestus can model a
Codex harness provider only when invoking official Codex local workflows is
useful and supportable. Codex ChatGPT sign-in, API-key sign-in, and Codex access
tokens remain Codex-side authentication mechanisms. Cestus records:

- provider ID
- backend kind `openai-codex-harness`
- safe availability state
- supported run modes
- credential kind such as `subscription-oauth`, `device-code-oauth`, or
  `api-key-bearer`
- safe output artifact references

Cestus does not copy Codex access tokens, browser sessions, or Codex auth
storage. If Codex internally ties a run to a ChatGPT user/workspace, Cestus
treats that as provider-side governance metadata and keeps the Cestus resident
agent identity unchanged.

### xAI API

xAI public API adapters use `api-key-bearer` against the OpenAI-compatible REST
API. The registry should mark xAI API as OpenAI-compatible while preserving
provider-specific model families, tool behavior, rate limits, and data-handling
notes.

xAI management metadata such as redacted API key labels, ACLs, expiration, and
rate limits can inform readiness if collected through an approved admin path.
The unredacted key is secret material and must never enter Cestus state.

xAI mTLS is enterprise hardening. The descriptor should model mTLS as an
additional requirement alongside API-key auth, with endpoint kind
`xai-api-mtls` or capability flag `requires-mtls`.

### xAI Subscription OAuth And Device Code

xAI officially documents subscription OAuth/device flows for named integrations
and its CLI. Cestus may support an xAI harness provider only when it can invoke
an official, stable entrypoint without reading token files or relying on another
tool's private auth storage.

Rules:

- Subscription OAuth is scoped to the named harness.
- Device-code OAuth is setup-only and transient.
- Cestus must not claim that a Grok subscription is a bearer credential for the
  xAI REST API.
- A harness provider must expose outputs as artifacts and safe diagnostics, not
  as hidden state.

### BYOK OpenAI-Compatible Endpoints

BYOK means the operator brings a credential into a secret store and registers a
provider descriptor. The portable workspace can store a provider ID, safe label,
compatibility profile, and credential reference ID. It must not store the API
key, raw auth header, private endpoint secret, or secret-shaped endpoint label.

Compatibility profiles:

- `openai-responses-compatible`
- `openai-chat-completions-compatible`
- `openai-embeddings-compatible`
- `custom-openai-like`

The adapter must probe capabilities through fake tests and optional live checks
before declaring strict structured-output or tool-calling support.

### Local Models

Local models use `local-no-secret` unless a local server requires auth. If a
local server requires auth, it becomes a BYOK or enterprise gateway provider,
not a pure local provider.

Local-provider descriptors should report:

- local engine name
- model families
- process or service availability as safe status
- hardware/resource readiness
- context limits
- structured-output support
- no remote byte transfer

Local execution can still be blocked by policy if the model output cannot meet
schema, provenance, or safety requirements.

### Enterprise Gateways

Enterprise gateway providers represent organization-managed routing and secret
control. They may wrap OpenAI, xAI, local hosted models, or other vendors.
Cestus treats the gateway as the provider boundary it can verify:

- gateway provider descriptor
- safe health endpoint
- policy version
- model families exposed by the gateway
- data residency and retention notes supplied by the organization
- credential kind `enterprise-gateway`, optionally paired with mTLS or workload
  identity

The gateway is still not the resident agent identity.

## Secret-Store Boundaries

Allowed backends:

- OS keyring
- local encrypted store outside portable ontology state
- enterprise secret manager
- explicitly approved process environment for local development

Secret-store API requirements:

- The resolver returns secret material only to provider adapters in memory.
- Secret material objects must not implement JSON serialization that reveals
  values.
- Diagnostic messages from secret backends must be normalized to safe
  categories.
- Store bindings must be tested for non-serialization across nested objects,
  errors, arrays, and accessor-backed values.
- Rotation and revocation update safe status through append-only events or safe
  local runtime state.

Secret-store binding state should be machine-local unless an enterprise manager
is configured. Moving an external-drive workspace to another machine should
produce `credential-binding-missing` or `needs-provider-setup`, not copy or
fallback to hidden credentials.

## Browser DTO Safety

Browser DTOs may include:

- provider safe label
- provider backend kind
- supported capability summary
- credential kind
- safe readiness state
- safe setup action IDs
- required approval class
- fake/live health check timestamp
- redacted diagnostic category
- allowed repair actions that do not include secret values or raw env names

Browser DTOs must not include:

- secret values
- raw auth headers
- raw token or key identifiers that are credential-shaped
- raw environment variable names
- local secret-store paths
- raw provider endpoint secrets
- OAuth device secrets
- private key paths
- raw provider errors
- provider account email or username unless a human explicitly marks it safe
  for local display

Setup cards should say things like:

- `Works locally`
- `Needs API key`
- `Needs device sign-in`
- `Credential linked, health unverified`
- `Not available for this task`
- `Requires approval before byte transfer`
- `Policy blocks this provider for sensitive evidence`

The card action is an opaque safe command ID. The local runtime owns the trusted
setup flow.

## Portable External-Drive Workspace Behavior

The external-drive workspace remains a portable ontology and evidence workspace,
not a portable credential vault.

Allowed in the portable workspace:

- provider IDs
- provider capability metadata
- credential reference IDs
- safe credential kind
- safe readiness summaries
- policy IDs
- source event IDs
- projection rebuild state

Forbidden in the portable workspace:

- secrets
- raw credential binding locations
- raw endpoint credentials
- raw device codes
- OAuth tokens
- browser session material
- local auth database paths
- private key material or private key paths

When a portable workspace is mounted on a new machine:

1. The provider registry rebuilds from ledger/config state.
2. The secret-store resolver checks for local bindings.
3. Missing bindings produce safe diagnostics and setup cards.
4. Local providers may become ready if the machine has the engine installed.
5. Remote providers remain unavailable until the operator links credentials on
   that machine or through an enterprise manager.
6. No hidden fallback to repo-local storage or copied internal credentials is
   allowed.

## Provider Health Diagnostics

Provider diagnostics are structured, inspectable, and secret-safe.

Readiness states:

- `ready`
- `works-locally`
- `needs-api-key`
- `needs-workload-identity`
- `needs-oauth-sign-in`
- `needs-device-sign-in`
- `needs-mtls-binding`
- `credential-binding-missing`
- `credential-expired`
- `credential-revoked`
- `insufficient-scope`
- `provider-unavailable`
- `harness-not-installed`
- `local-model-not-running`
- `not-available-for-task`
- `policy-blocked`
- `requires-byte-transfer-approval`
- `health-unverified`

Diagnostic fields:

- diagnostic ID
- provider ID
- credential reference ID when safe
- safe category
- severity
- retryability
- last checked timestamp
- policy version
- related event IDs
- safe repair action IDs

Raw provider errors must be reduced to categories such as
`auth-rejected`, `rate-limited`, `network-timeout`, `model-unavailable`,
`schema-unsupported`, or `harness-exit-failed`. A suspected secret leak should
activate or reference a governance incident and block the affected output from
normal projections.

## Provider Byte-Transfer Gates

Remote provider use is not automatically unsafe, but Cestus must distinguish
task metadata from byte transfer.

No approval required by default:

- listing safe provider descriptors
- checking local fake provider health
- checking a local model process
- reading safe credential binding status
- using a local-no-secret provider
- preparing a model invocation preview

Human approval required:

- sending document bytes to a remote provider
- sending private evidence text to a remote provider
- sending source-identifying sensitive context to a remote provider
- invoking a harness with access to workspace files outside the approved scope
- exporting reports or public outputs
- PRR sends, appeals, or legal escalation

Approvals bind the exact preview hash, provider ID, credential reference ID,
input artifact hashes, data classification, task scope, and intended effect. If
any referenced bytes or prompt preview changes, the approval is stale and the
call must fail closed.

## Test And Fake Provider Expectations

Standard verification must require no live provider credentials and no outbound
document transfer.

Required fake coverage:

- deterministic fake provider outputs
- fake provider health states for ready, missing credential, expired
  credential, unsupported model, policy block, and byte-transfer approval needed
- fake secret store with non-serializable secret material
- provider descriptors that reject resident agent IDs and secret-shaped fields
- browser DTOs that redact nested secret-shaped errors
- portable workspace mount without local secret bindings
- provider selection policy that chooses local/fake providers for sensitive
  evidence when they satisfy task needs
- approval preview hash staleness

Optional live checks belong behind explicit operator commands and must never be
part of `npm run verify`.

## Event And Projection Additions

The foundation plan already includes model invocation and credential reference
fields. The live provider/auth slice should add only the minimum additional
events needed for rebuildable provider state:

- `agent.provider.registered`
- `agent.provider.status.checked`
- `agent.credential-reference.linked`
- `agent.credential-reference.status.changed`
- `agent.provider-policy.installed`

All event payloads are strict, secret-safe, and replayable. They may reference
credential reference IDs and safe readiness state, but not secret bindings. If
the foundation package can keep some machine-local binding state outside the
ledger, that state must remain derivable as runtime readiness, not ontology
truth.

## Implementation-Slice Decomposition

1. Secret-free provider registry and credential references

   Add credential reference contracts, provider descriptor registry, secret-store
   interface, readiness DTOs, fake provider health checks, and browser-safe
   setup cards. No live provider calls.

2. Local runtime setup and secret-store bindings

   Add local CLI/setup flows for OS keyring, local encrypted store, and approved
   process environment. Keep all browser output secret-safe.

3. OpenAI API adapter

   Add API-key and workload identity support with optional live smoke checks.
   Standard tests use fake HTTP and fake token exchange.

4. xAI API and mTLS adapter

   Add xAI OpenAI-compatible API support, key metadata readiness, and mTLS
   companion requirements. Standard tests use fake HTTP and fake certificate
   bindings.

5. BYOK OpenAI-compatible and enterprise gateway adapters

   Add compatibility profiles, endpoint policy, and gateway health contracts.
   Live checks remain opt-in.

6. Local model adapters

   Add local engine descriptors, health checks, and structured-output guards.

7. Official harness adapters

   Add Codex or xAI harness adapters only where official product entrypoints are
   stable enough. Do not read private auth stores. Do not turn subscription
   OAuth into generic API auth.

8. Team and enterprise hardening

   Add organization-scoped credential references, role-aware setup permissions,
   enterprise secret manager bindings, audit views, and gateway policy
   enforcement.

## Acceptance Criteria

- Provider accounts, subscriptions, harness sessions, local model processes,
  and credentials never become Cestus resident agent identity.
- Provider capability cards are useful without exposing secrets or raw env
  names.
- Credential references are durable, replayable, secret-free, and portable.
- Secret-store bindings are local or enterprise runtime state outside portable
  ontology state.
- Subscription OAuth is limited to named official integrations or harnesses.
- Fake providers and fake secret stores cover standard verification.
- Provider byte transfer remains approval-gated and preview-hash-bound.
- OpenAI and xAI official-source claims remain linked in docs.

## First Slice Summary

The first approved implementation slice should create a secret-free credential
reference and provider registry layer with safe readiness DTOs, a local
encrypted/keyring abstraction interface, and fake provider health tests. It
should not call live OpenAI, live xAI, BYOK endpoints, local model servers, or
external gateways. That gives Cestus the contract surface it needs before any
credential-bearing or byte-transferring adapter is added.
