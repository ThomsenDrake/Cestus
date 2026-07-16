# Resident Agent Provider and Credentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` only after the coordinator sends an
> exact scoped implementation authorization naming the approved Lane P design,
> this reviewed plan commit, the allowed task range, CF-1 SHA, and the wave
> stop. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide one selected, policy-bound provider backend for the resident
without ever persisting or exposing secret material, treating a subscription as
an identity, replacing an unavailable backend, or turning provider success
into a durable task result.

**Architecture:** CF-1 freezes the provider/credential and preparation
contracts at the existing boundaries. Tasks 126--130 add isolated BYOK,
OS-secret, local-model, Codex-harness, and xAI-harness adapters. Task 133 (R)
consumes a frozen P preparation result only to render the exact approved prompt
boundary. Task 139 is the sole P configuration integration owner after all
adapter commits are reviewed. Readiness and feasibility are safe observations;
append-only feasibility evidence and H-owned handoff readback remain the only
durable proof.

**Tech Stack:** TypeScript (strict), Zod, Vitest, existing agent provider and
secret-safe contracts, an operator-selected OS secret facility, mounted
workspace authority, and a coordinator-controlled real Nous acceptance gate.

## Global Constraints

- Approved Lane P design:
  `docs/superpowers/specs/2026-07-12-resident-agent-provider-credentials-design.md@285657a7879cdc47e321152c2bc5feb0ebe6088f`.
- Governing program plan:
  `docs/superpowers/plans/2026-07-12-resident-agent-full-vision-program-implementation.md@0b5726ec975bdc0aae97e540472ef3be4379b358`.
- `agent_default` is the only resident identity. Provider, model, endpoint,
  harness, subscription, credential reference, and local engine are backends,
  not a source of workspace, task, ledger, approval, or tool authority.
- A verified mounted workspace, current resident/task/attempt/run, policy,
  locks, source/context/artifact hashes, projection freshness, and exact
  capability/ref/model bindings are required before secret resolution, network
  I/O, feasibility append, or output handling. A disconnect or mismatch stops
  before resolution/call and writes no fallback ledger, projection, prompt,
  artifact, derivative, cache, temporary file, secret, or alternate workspace.
- The ledger is append-only and projections rebuild. Feasibility, revocation,
  rotation, correction, provider result, and handoff lifecycle are new,
  provenance-bound records; readiness, an output hash, or a success return is
  never task completion.
- Portable state contains typed secret-free references only. It contains no
  secret value, derived secret hash, OS locator/path, environment variable,
  endpoint query, cookie, header, CLI-auth-store data, browser state, or raw
  provider response.
- `PromptArtifactEnvelope` or verified typed `inputText` is the only remote
  input boundary. Prompt/evidence transfer uses separately governed
  `provider-byte-transfer` approval consumption; P neither creates nor
  consumes that approval and cannot broaden provider, model, ref, budget,
  approval class, or transfer category.
- A policy selects one exact capability. BYOK, local, another model/account,
  another provider family, and a harness are never an implicit fallback.
  Local execution is allowed only when the descriptor and policy explicitly
  select it.
- Deterministic suites are credential-free. A later coordinator-only real
  approved Nous gate is mandatory for provider-bearing acceptance. Recorded
  live evidence contains safe markers, IDs, hashes, counts, categories, and
  readback markers only.
- Codex and xAI support uses only officially documented non-extractive flows.
  Cookie/session/browser storage, token cache, intercepted header,
  undocumented API, reverse-engineered device grant, CLI-auth-store, and
  subscription-token extraction are forbidden. No subscription credential is a
  general API key.
- Every worker uses the user-confirmed GPT-5.6 Terra / Extra High
  configuration, TDD, fresh review, verification-before-completion, a rebase
  to the recorded CF-1/dependency SHA, and no self-merge into `neo`.

## Task 114 Structural Plan Contract

This is the single documentation RED/GREEN contract for Task 114. It validates
only an exact, case-sensitive Markdown table row in the named local section;
it neither lowercases text nor searches the document globally. A word that
appears incidentally elsewhere therefore cannot satisfy an entry. The
counterfactual loop directly replaces each required local row and requires the
validator to reject that mutated document.

| Contract key | Exact plan heading | Locally required entries |
| --- | --- | --- |
| `cf1-boundary` | `CF-1 Contract Gate And Existing-Boundary Compatibility` | `T114-CF1-OWNER`, `T114-CF1-COMPAT` |
| `interfaces` | `Frozen Interface Inputs And Cross-Lane Contract` | `T114-INTERFACE-FREEZE`, `T114-PROMPT-BOUNDARY` |
| `ownership` | `File Ownership And Dependency Order` | `T114-OWNERSHIP-SINGULAR`, `T114-DEPENDENCY-ORDER` |
| `byok` | `Task 126: Generic OpenAI-Compatible BYOK` | `T114-126-RED`, `T114-126-GREEN`, `T114-126-REVIEW`, `T114-126-PORTABLE` |
| `os-secret` | `Task 127: OS-Backed Secret Resolution` | `T114-127-RED`, `T114-127-GREEN`, `T114-127-REVIEW`, `T114-127-OS-ONLY` |
| `local-model` | `Task 128: Explicit Local-Model Provider` | `T114-128-RED`, `T114-128-GREEN`, `T114-128-REVIEW`, `T114-128-NO-FALLBACK` |
| `codex` | `Task 129: Official Codex Subscription Harness` | `T114-129-RED`, `T114-129-GREEN`, `T114-129-REVIEW`, `T114-129-OFFICIAL` |
| `xai` | `Task 130: Official xAI Subscription Harness` | `T114-130-RED`, `T114-130-GREEN`, `T114-130-REVIEW`, `T114-130-OFFICIAL` |
| `renderer-config` | `Task 133 Provider Boundary Consumption And Task 139 Configuration` | `T114-133-R-OWNER`, `T114-139-P-OWNER`, `T114-139-RED`, `T114-139-GREEN`, `T114-139-REVIEW`, `T114-139-REBASE` |
| `acceptance` | `Deterministic, Live Nous, And Secret-Safety Acceptance` | `T114-ACCEPT-DETERMINISTIC`, `T114-ACCEPT-LIVE-NOUS` |
| `rollback-stop` | `Merge, Rebase, Rollback, And Stop Conditions` | `T114-ROLLBACK-APPEND-ONLY`, `T114-STOP-ESCALATE` |

Run this command from the repository root for RED and GREEN:

```bash
node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";

const file = "docs/superpowers/plans/2026-07-12-resident-agent-provider-credentials-implementation.md";
const plan = readFileSync(file, "utf8");
const contract = new Map([
  ["cf1-boundary", { heading: "CF-1 Contract Gate And Existing-Boundary Compatibility", rows: [
    ["T114-CF1-OWNER", "CF-1 is the only authority that assigns canonical provider contracts and their production owners."],
    ["T114-CF1-COMPAT", "Existing provider compatibility boundaries remain authoritative until CF-1 records an explicit migration; no compatibility alias is permitted."],
  ] }],
  ["interfaces", { heading: "Frozen Interface Inputs And Cross-Lane Contract", rows: [
    ["T114-INTERFACE-FREEZE", "CF-1 freezes the exact CredentialReference, ProviderCapability, ProviderFeasibilityRecord, OsSecretStore, and ProviderInvocationPreparation interfaces before implementation."],
    ["T114-PROMPT-BOUNDARY", "The only remote input is verified PromptArtifactEnvelope or typed inputText after independent provider-byte-transfer approval consumption."],
  ] }],
  ["ownership", { heading: "File Ownership And Dependency Order", rows: [
    ["T114-OWNERSHIP-SINGULAR", "Tasks 126 through 130 own their listed adapters; R owns Task 133; Task 139 is P's sole provider-configuration owner."],
    ["T114-DEPENDENCY-ORDER", "Tasks 126 through 130 wait for CF-1; Task 133 waits for their merged interfaces; Task 139 waits for Tasks 126 through 130 and Task 133."],
  ] }],
  ["byok", { heading: "Task 126: Generic OpenAI-Compatible BYOK", rows: [
    ["T114-126-RED", "RED runs the named BYOK command before byok-provider.ts exists and proves secret-bearing or mismatched input fails before resolution or I/O."],
    ["T114-126-GREEN", "GREEN runs the named BYOK command, git diff --check, npm run factory:check, and npm run verify after the smallest exact adapter change."],
    ["T114-126-REVIEW", "A fresh reviewer verifies endpoint policy, current approval binding, secret-safe failure, and no provider fallback before the Task 126 merge gate."],
    ["T114-126-PORTABLE", "Portable state holds only a typed secret-free reference; it contains no credential value or derived-secret hash."],
  ] }],
  ["os-secret", { heading: "Task 127: OS-Backed Secret Resolution", rows: [
    ["T114-127-RED", "RED runs the named OS-secret command before os-secret-store.ts exists and proves invalid exact-use requests fail safely."],
    ["T114-127-GREEN", "GREEN runs the named OS-secret command, git diff --check, npm run factory:check, and npm run verify after the minimal OS-backed implementation."],
    ["T114-127-REVIEW", "A fresh reviewer verifies structural input safety, secret-safe diagnostics, and credential-free test fakes before the Task 127 merge gate."],
    ["T114-127-OS-ONLY", "The OS secret adapter permits neither .env nor plaintext fallback and persists no secret, locator, cache, temporary file, browser state, CLI store, or alternate workspace copy."],
  ] }],
  ["local-model", { heading: "Task 128: Explicit Local-Model Provider", rows: [
    ["T114-128-RED", "RED runs the named local-model command before local-model-provider.ts exists and rejects an unselected local engine or remote substitution."],
    ["T114-128-GREEN", "GREEN runs the named local-model command, git diff --check, npm run factory:check, and npm run verify after the explicit local capability change."],
    ["T114-128-REVIEW", "A fresh reviewer verifies explicit policy and descriptor selection, local-compute budget enforcement, and credential-free parity before the Task 128 merge gate."],
    ["T114-128-NO-FALLBACK", "A local model is never an implicit fallback for Nous, BYOK, Codex, xAI, another model, account, credential, or provider family."],
  ] }],
  ["codex", { heading: "Task 129: Official Codex Subscription Harness", rows: [
    ["T114-129-RED", "RED runs the named Codex harness command before codex-subscription-harness.ts exists and rejects unofficial credential sources."],
    ["T114-129-GREEN", "GREEN runs the named Codex harness command, git diff --check, npm run factory:check, and npm run verify after the official-only feasibility boundary."],
    ["T114-129-REVIEW", "A fresh reviewer requires official evidence or durable unavailable feasibility and verifies no substitute provider is selected before the Task 129 merge gate."],
    ["T114-129-OFFICIAL", "Codex support uses only an officially documented non-extractive flow; absent support appends official-flow-unavailable evidence and never extracts a token."],
  ] }],
  ["xai", { heading: "Task 130: Official xAI Subscription Harness", rows: [
    ["T114-130-RED", "RED runs the named xAI harness command before xai-subscription-harness.ts exists and rejects unofficial credential sources."],
    ["T114-130-GREEN", "GREEN runs the named xAI harness command, git diff --check, npm run factory:check, and npm run verify after the official-only feasibility boundary."],
    ["T114-130-REVIEW", "A fresh reviewer verifies provider-specific official evidence, safe unavailable feasibility, and no fallback before the Task 130 merge gate."],
    ["T114-130-OFFICIAL", "xAI support uses only an officially documented non-extractive flow; absent support appends official-flow-unavailable evidence and never extracts a token."],
  ] }],
  ["renderer-config", { heading: "Task 133 Provider Boundary Consumption And Task 139 Configuration", rows: [
    ["T114-133-R-OWNER", "R alone owns Task 133 prompt rendering; P does not edit the renderer or consume approval, resolve a secret, or invoke a provider there."],
    ["T114-139-P-OWNER", "Task 139 is P's one provider-configuration owner and does not edit the default runtime factory."],
    ["T114-139-RED", "RED runs the named Task 139 configuration command before agent-provider-configuration.ts exists and rejects stale, duplicate, secret-bearing, or fallback configuration."],
    ["T114-139-GREEN", "GREEN runs the named Task 139 configuration command, git diff --check, npm run factory:check, and npm run verify after the minimal sole-owner configuration change."],
    ["T114-139-REVIEW", "A fresh reviewer verifies the sole configuration owner, predecessor rebase evidence, feasibility provenance, and no default-factory edit before the Task 139 merge gate."],
    ["T114-139-REBASE", "Task 139 starts only after Tasks 126 through 130 and Task 133 are reviewed and merged, then rebases to every recorded predecessor SHA before review."],
  ] }],
  ["acceptance", { heading: "Deterministic, Live Nous, And Secret-Safety Acceptance", rows: [
    ["T114-ACCEPT-DETERMINISTIC", "Deterministic suites are credential-free and use only test-process fakes that production configuration rejects."],
    ["T114-ACCEPT-LIVE-NOUS", "The coordinator-only live Nous gate runs npm run agent:nous:smoke with real approved OS-stored credentials, independent approval revalidation, and safe hashes, IDs, counts, categories, and readback marker only."],
  ] }],
  ["rollback-stop", { heading: "Merge, Rebase, Rollback, And Stop Conditions", rows: [
    ["T114-ROLLBACK-APPEND-ONLY", "Rollback is append-only: append a superseding policy, reference, or feasibility correction and rebuild projections; never delete evidence or restore a fallback store."],
    ["T114-STOP-ESCALATE", "Stop for secret or plaintext fallback, unofficial token extraction, mandatory Nous unavailability, ownership conflict, data-loss risk, or two focused verifier failures; return structured evidence to the coordinator."],
  ] }],
]);
const mark = String.fromCharCode(96);
const extract = (document, heading) => {
  const start = document.indexOf("## " + heading + "\n");
  if (start < 0) throw new Error("missing exact heading: " + heading);
  const end = document.indexOf("\n## ", start + heading.length + 4);
  return document.slice(start, end < 0 ? document.length : end);
};
const rowText = ([id, statement]) => "| " + mark + id + mark + " | " + statement + " |";
const validate = (document) => {
  for (const [key, specification] of contract) {
    const local = extract(document, specification.heading);
    for (const row of specification.rows) {
      if (!local.includes(rowText(row))) {
        throw new Error(key + ": missing local contract row " + row[0]);
      }
    }
  }
};
const replaceOne = (document, before, after) => {
  const start = document.indexOf(before);
  if (start < 0) throw new Error("counterfactual setup lost local section");
  return document.slice(0, start) + after + document.slice(start + before.length);
};

validate(plan);
let rejected = 0;
for (const [key, specification] of contract) {
  const local = extract(plan, specification.heading);
  for (const row of specification.rows) {
    const exact = rowText(row);
    const mutated = local.replace(exact, "| " + mark + row[0] + mark + " | [REMOVED BY COUNTERFACTUAL] |");
    if (mutated === local) throw new Error(key + ": mutation setup failed for " + row[0]);
    let rejectedVariant = false;
    try {
      validate(replaceOne(plan, local, mutated));
    } catch {
      rejectedVariant = true;
    }
    if (!rejectedVariant) throw new Error(key + ": accepted direct mutation of " + row[0]);
    rejected += 1;
  }
}
console.log("GREEN: Task 114 structural provider-plan contract passed (" + rejected + " direct local mutations rejected).");
NODE
```

The Task 114 RED result is the expected ENOENT while this plan is absent.
Any later forward documentation repair must first remove one exact local row,
observe the validator reject it, restore the row, and record the GREEN result.
After GREEN, run git diff --check, npm run factory:check, and npm run verify.

## CF-1 Contract Gate And Existing-Boundary Compatibility

| Contract entry | Required local statement |
| --- | --- |
| `T114-CF1-OWNER` | CF-1 is the only authority that assigns canonical provider contracts and their production owners. |
| `T114-CF1-COMPAT` | Existing provider compatibility boundaries remain authoritative until CF-1 records an explicit migration; no compatibility alias is permitted. |

CF-1 is the only authority that turns the proposed P vocabulary into canonical
schemas, event names/versions, ID grammars, parser identities, serialization,
idempotency keys, event streams, migration rules, error categories, fixtures,
and one writer for every shared file. Before any Task 126--130 RED, the freeze
must name the exact provider/credential reference schema, feasibility evidence
event and projection owner, secret-store capability, provider preparation
signature, prompt/approval binding, local engine posture, official-harness
record, and Task 139 configuration owner.

The existing `packages/agent/src/provider.ts`,
`packages/agent/src/provider-registry.ts`, and
`packages/agent/src/secret-store.ts` remain authoritative compatibility
boundaries until CF-1 records an explicit replacement or migration. No task
may silently widen them, import a proposal as a canonical type, or create a
no compatibility alias merely to make an older consumer compile. A conflict,
missing event owner, or schema mismatch produces a blocked claim for
coordinator resolution rather than a local interface invention.

CF-1 also freezes the sole writer order: the shared contract predecessor lands
first; Tasks 126--130 each rebase to that SHA; Task 133 (R) consumes their
frozen interface without changing P files; Task 139 rebases to all reviewed
adapter and Task 133 SHAs. No provider task edits R's default runtime factory,
W mount lifecycle, L budgets, H handoff/ledger code, U DTOs, A acceptance
matrix, or registry/control documents.

## Frozen Interface Inputs And Cross-Lane Contract

| Contract entry | Required local statement |
| --- | --- |
| `T114-INTERFACE-FREEZE` | CF-1 freezes the exact CredentialReference, ProviderCapability, ProviderFeasibilityRecord, OsSecretStore, and ProviderInvocationPreparation interfaces before implementation. |
| `T114-PROMPT-BOUNDARY` | The only remote input is verified PromptArtifactEnvelope or typed inputText after independent provider-byte-transfer approval consumption. |

The following are proposed names only. CF-1 must freeze these signatures or a
semantically equivalent revision recorded in every dependent claim. Each is a
plain own-data, normalized, frozen input; no value includes prompt/evidence
bytes, a secret, header, endpoint, raw error, cookie, command, or resolver.

```ts
export interface CredentialReference {
  readonly credentialRefId: `agent_credref_${string}`;
  readonly providerId: `provider_${string}`;
  readonly credentialKind: "api-key-bearer" | "workload-identity-token" | "subscription-oauth" | "device-code-oauth" | "local-no-secret" | "mtls-certificate" | "enterprise-gateway";
  readonly capabilityScopes: readonly ("model-inference" | "provider-health" | "provider-parse" | "harness-execution")[];
  readonly status: "linked" | "missing-binding" | "healthy" | "expired" | "revoked" | "insufficient-scope" | "unverified";
  readonly policyVersion: string;
  readonly sourceEventIds: readonly string[];
}

export interface ProviderCapability {
  readonly providerId: `provider_${string}`;
  readonly modelIds: readonly string[];
  readonly capabilityHash: `sha256:${string}`;
  readonly adapterVersion: string;
  readonly backendKind: "openai-compatible-api" | "local-engine" | "openai-codex-harness" | "xai-harness" | "enterprise-gateway";
  readonly approvalProfile: "local-only" | "remote-byte-transfer-gated" | "harness-workspace-gated";
}

export interface ProviderFeasibilityRecord {
  readonly recordId: string;
  readonly providerId: `provider_${string}`;
  readonly capabilityHash: `sha256:${string}`;
  readonly posture: "feasible" | "unavailable" | "blocked" | "not-applicable";
  readonly category: string;
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly sourceEventIds: readonly string[];
  readonly safeEvidenceHashes: readonly `sha256:${string}`[];
  readonly supersedesRecordId?: string;
}

export interface OsSecretStore {
  resolveForExactUse(input: Readonly<{
    credentialRef: CredentialReference;
    capabilityHash: `sha256:${string}`;
    workspaceId: string;
    mountInstanceId: string;
    runId: string;
    purpose: "model-inference" | "provider-health" | "harness-execution";
  }>): Promise<OsSecretResolution>;
}

export interface ProviderInvocationPreparation {
  readonly preparationVersion: string;
  readonly residentAgentId: "agent_default";
  readonly workspaceId: string;
  readonly mountInstanceId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly runId: string;
  readonly providerId: `provider_${string}`;
  readonly modelId: string;
  readonly capabilityHash: `sha256:${string}`;
  readonly credentialRefId?: `agent_credref_${string}`;
  readonly promptArtifactHash: `sha256:${string}`;
  readonly policyVersion: string;
  readonly approvalPreviewHash?: `sha256:${string}`;
  readonly readiness: "invocation-ready" | "waiting-for-approval" | "unavailable" | "blocked";
}

export interface ProviderConfigurationInput {
  readonly capabilities: readonly ProviderCapability[];
  readonly credentialReferences: readonly CredentialReference[];
  readonly feasibilityRecords: readonly ProviderFeasibilityRecord[];
  readonly secretStore: OsSecretStore;
}
```

Task 133 receives a verified `PromptArtifactEnvelope` and the frozen
`ProviderInvocationPreparation`; it renders the exact run-bound `inputText`
only after the existing `provider-byte-transfer` approval consumer proves the
exact preview is current. P never receives a hash-to-text resolver, raw prompt,
raw evidence reader, approval object, arbitrary request object, or provider
output. Secret material may be selected only inside the adapter after this
preparation is current; it is process-local/non-serializable and cannot enter
`ProviderConfigurationInput`, an event, a projection, a DTO, a test fixture,
or a log.

## File Ownership And Dependency Order

| Contract entry | Required local statement |
| --- | --- |
| `T114-OWNERSHIP-SINGULAR` | Tasks 126 through 130 own their listed adapters; R owns Task 133; Task 139 is P's sole provider-configuration owner. |
| `T114-DEPENDENCY-ORDER` | Tasks 126 through 130 wait for CF-1; Task 133 waits for their merged interfaces; Task 139 waits for Tasks 126 through 130 and Task 133. |

| Task | Exclusive later production files | Exclusive later tests/claim | Depends on | Produces |
| --- | --- | --- | --- | --- |
| Task 126 | Create `packages/agent/src/byok-provider.ts` | Create `packages/agent/test/byok-provider.test.ts`; create `docs/agentic/claims/task-126-resident-full-vision-byok-provider.md` | CF-1; Task 127 OS secret contract | Generic OpenAI-compatible BYOK adapter; references only. |
| Task 127 | Create `packages/agent/src/os-secret-store.ts` | Create `packages/agent/test/os-secret-store.test.ts`; create `docs/agentic/claims/task-127-resident-full-vision-os-secret-store.md` | CF-1 | Exact-use OS secret adapter and safe health. |
| Task 128 | Create `packages/agent/src/local-model-provider.ts` | Create `packages/agent/test/local-model-provider.test.ts`; create `docs/agentic/claims/task-128-resident-full-vision-local-model-provider.md` | CF-1; L policy/budget interpretation | Explicit local-engine capability. |
| Task 129 | Create `packages/agent/src/codex-subscription-harness.ts` | Create `packages/agent/test/codex-subscription-harness.test.ts`; create `docs/agentic/claims/task-129-resident-full-vision-codex-harness.md` | CF-1; official-flow evidence | Codex capability or safe unavailable feasibility. |
| Task 130 | Create `packages/agent/src/xai-subscription-harness.ts` | Create `packages/agent/test/xai-subscription-harness.test.ts`; create `docs/agentic/claims/task-130-resident-full-vision-xai-harness.md` | CF-1; official-flow evidence | xAI capability or safe unavailable feasibility. |
| Task 133 | R owns `packages/local-runtime/src/agent-runtime-prompt-renderer.ts` | R owns `packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts` | Tasks 126--130 merged/rebased | Exact run/prompt/provider preparation consumer; P is read-only consumer. |
| Task 139 | Create `packages/local-runtime/src/agent-provider-configuration.ts` | Create `packages/local-runtime/test/agent-provider-configuration.test.ts`; create `docs/agentic/claims/task-139-resident-full-vision-provider-configuration.md` | Tasks 126--130 and Task 133 merged/rebased | One configuration owner registers capabilities and current feasibility. |

Tasks 126--130 do not modify `provider.ts`, `provider-registry.ts`,
`secret-store.ts`, `agent-provider-readiness.ts`, default runtime composition,
or any shared contract unless CF-1 explicitly assigns that exact write. Task
139 is the one configuration owner; no adapter builds an alternate local
runtime or self-registers through an unreviewed process-global side effect.

## Task 126: Generic OpenAI-Compatible BYOK

| Contract entry | Required local statement |
| --- | --- |
| `T114-126-RED` | RED runs the named BYOK command before byok-provider.ts exists and proves secret-bearing or mismatched input fails before resolution or I/O. |
| `T114-126-GREEN` | GREEN runs the named BYOK command, git diff --check, npm run factory:check, and npm run verify after the smallest exact adapter change. |
| `T114-126-REVIEW` | A fresh reviewer verifies endpoint policy, current approval binding, secret-safe failure, and no provider fallback before the Task 126 merge gate. |
| `T114-126-PORTABLE` | Portable state holds only a typed secret-free reference; it contains no credential value or derived-secret hash. |

**Files:**

- Create: `packages/agent/src/byok-provider.ts`
- Create: `packages/agent/test/byok-provider.test.ts`
- Create: `docs/agentic/claims/task-126-resident-full-vision-byok-provider.md`

**Consumes:** CF-1's `ProviderCapability`, `CredentialReference`,
`ProviderInvocationPreparation`, endpoint policy, Task 127's `OsSecretStore`,
and the existing approved remote-transfer consumer. **Produces:** an adapter
for one policy-selected OpenAI-compatible provider/model/ref combination.

- [ ] **Step 1: Claim, rebase, and write RED tests.**

  Claim the exact CF-1 SHA and rebase. In `byok-provider.test.ts`, reject a
  literal API material field, secret-shaped safe label, provider/model/ref
  mismatch, absent or revoked ref, wildcard or unapproved endpoint policy,
  stale mount/run/prompt/approval preparation, caller-supplied request object,
  and a fallback candidate. Assert no OS resolution, network fake, feasibility
  append, or portable write occurs. The test must prove no portable secret value
  or derived-secret hash can enter a reference, config, event, DTO, diagnostic,
  error, or log.

- [ ] **Step 2: Run RED.**

  ```bash
  npm test -- packages/agent/test/byok-provider.test.ts packages/agent/test/openai-compatible-provider.test.ts
  ```

  Expected: FAIL because `byok-provider.ts` is absent. The failure precedes an
  OS-secret resolution, network request, prompt construction, or approval use.

- [ ] **Step 3: Implement one exact adapter.**

  Normalize then freeze the CF-1 preparation before `await`; verify the exact
  endpoint policy, selected provider/model/capability/ref, mounted authority,
  budget, prompt hash, and independently consumed approval. Resolve opaque
  material only through `OsSecretStore.resolveForExactUse` immediately before
  the authenticated request. It has no portable secret value, `.env`, browser,
  CLI, raw URL, raw request, retry substitution, or no fallback path.

- [ ] **Step 4: Run GREEN, verify, commit, and review.**

  ```bash
  npm test -- packages/agent/test/byok-provider.test.ts packages/agent/test/openai-compatible-provider.test.ts
  git diff --check
  npm run factory:check
  npm run verify
  git add packages/agent/src/byok-provider.ts packages/agent/test/byok-provider.test.ts docs/agentic/claims/task-126-resident-full-vision-byok-provider.md
  git commit -m "feat: add policy-bound BYOK provider"
  ```

  Fresh review verifies reference-only portable state, endpoint policy,
  no fallback, current approval boundary, and secret-safe failures. No live
  credential or provider call occurs in this task.

## Task 127: OS-Backed Secret Resolution

| Contract entry | Required local statement |
| --- | --- |
| `T114-127-RED` | RED runs the named OS-secret command before os-secret-store.ts exists and proves invalid exact-use requests fail safely. |
| `T114-127-GREEN` | GREEN runs the named OS-secret command, git diff --check, npm run factory:check, and npm run verify after the minimal OS-backed implementation. |
| `T114-127-REVIEW` | A fresh reviewer verifies structural input safety, secret-safe diagnostics, and credential-free test fakes before the Task 127 merge gate. |
| `T114-127-OS-ONLY` | The OS secret adapter permits neither .env nor plaintext fallback and persists no secret, locator, cache, temporary file, browser state, CLI store, or alternate workspace copy. |

**Files:**

- Create: `packages/agent/src/os-secret-store.ts`
- Create: `packages/agent/test/os-secret-store.test.ts`
- Create: `docs/agentic/claims/task-127-resident-full-vision-os-secret-store.md`

**Consumes:** CF-1's exact `CredentialReference`, OS backend selection, and
secret-safe diagnostic categories. **Produces:** an `OsSecretStore` that
resolves material only for an exact current use and projects health only.

- [ ] **Step 1: Claim, rebase, and write RED tests.**

  Cover a valid typed ref, missing binding, locked/unsupported OS secret
  facility, expired/revoked/insufficient scope, swapped workspace/mount/run/
  capability/purpose, and accessor/prototype/symbol/sparse-array inputs. Assert
  that `toJSON`, errors, logs, DTOs, and feasibility records contain no
  material, locator, path, facility name, environment name, command, or header.
  Assert no .env, plaintext config, database, artifact, browser, CLI auth
  store, temporary file, cache, or process-memory persistence fallback.

- [ ] **Step 2: Run RED.**

  ```bash
  npm test -- packages/agent/test/os-secret-store.test.ts packages/agent/test/secret-store.test.ts
  ```

  Expected: FAIL because `os-secret-store.ts` is absent.

- [ ] **Step 3: Implement exact-use health and resolution.**

  The supported OS secret facility is chosen by CF-1, not guessed by the
  adapter. Validate the current reference/capability/mount/run/purpose before
  resolving; return `resolved`, `unavailable`, or `blocked` with safe health.
  The OS secret material is opaque, short-lived, non-serializable, and released
  after immediate adapter use. There is no `.env` fallback and no plaintext fallback.

- [ ] **Step 4: Run GREEN, verify, commit, and review.**

  ```bash
  npm test -- packages/agent/test/os-secret-store.test.ts packages/agent/test/secret-store.test.ts
  git diff --check
  npm run factory:check
  npm run verify
  git add packages/agent/src/os-secret-store.ts packages/agent/test/os-secret-store.test.ts docs/agentic/claims/task-127-resident-full-vision-os-secret-store.md
  git commit -m "feat: add exact-use OS secret store"
  ```

  Fresh review checks backend selection, no persistence/fallback, structural
  object safety, and that tests use credential-free fakes only.

## Task 128: Explicit Local-Model Provider

| Contract entry | Required local statement |
| --- | --- |
| `T114-128-RED` | RED runs the named local-model command before local-model-provider.ts exists and rejects an unselected local engine or remote substitution. |
| `T114-128-GREEN` | GREEN runs the named local-model command, git diff --check, npm run factory:check, and npm run verify after the explicit local capability change. |
| `T114-128-REVIEW` | A fresh reviewer verifies explicit policy and descriptor selection, local-compute budget enforcement, and credential-free parity before the Task 128 merge gate. |
| `T114-128-NO-FALLBACK` | A local model is never an implicit fallback for Nous, BYOK, Codex, xAI, another model, account, credential, or provider family. |

**Files:**

- Create: `packages/agent/src/local-model-provider.ts`
- Create: `packages/agent/test/local-model-provider.test.ts`
- Create: `docs/agentic/claims/task-128-resident-full-vision-local-model-provider.md`

**Consumes:** CF-1 local-engine capability, endpoint/reachability posture, and
L's frozen local-compute budget semantics. **Produces:** a local provider that
runs only when explicitly selected by the descriptor and policy.

- [ ] **Step 1: Claim, rebase, and write RED tests.**

  Require an exact `local-engine` capability, explicit provider/model
  selection, current mount/run/policy/budget/ref posture, and the
  `local-no-secret` rule unless CF-1 records a local gateway reference. Reject
  stopped/incompatible engine, changed capability/model, over budget, remote
  selection, caller-selected endpoint, and automatic substitution after remote
  failure. Assert local execution is never an implicit fallback and does not
  create a remote approval or portable fallback state.

- [ ] **Step 2: Run RED.**

  ```bash
  npm test -- packages/agent/test/local-model-provider.test.ts packages/agent/test/provider-readiness.test.ts
  ```

  Expected: FAIL because `local-model-provider.ts` is absent.

- [ ] **Step 3: Implement explicit local capability.**

  Construct only the CF-1 selected local-engine adapter. It verifies local
  reachability/features and local-compute budgets from the frozen preparation,
  preserves the prompt/run provenance boundary, and reports bounded safe
  unavailable/blocked categories. It never replaces remote BYOK, Nous, Codex,
  xAI, or another model implicitly.

- [ ] **Step 4: Run GREEN, verify, commit, and review.**

  ```bash
  npm test -- packages/agent/test/local-model-provider.test.ts packages/agent/test/provider-readiness.test.ts
  git diff --check
  npm run factory:check
  npm run verify
  git add packages/agent/src/local-model-provider.ts packages/agent/test/local-model-provider.test.ts docs/agentic/claims/task-128-resident-full-vision-local-model-provider.md
  git commit -m "feat: add explicit local model provider"
  ```

  Fresh review checks explicit selection, credential-free parity, bounded
  local-compute posture, and no fallback or remote policy bypass.

## Task 129: Official Codex Subscription Harness

| Contract entry | Required local statement |
| --- | --- |
| `T114-129-RED` | RED runs the named Codex harness command before codex-subscription-harness.ts exists and rejects unofficial credential sources. |
| `T114-129-GREEN` | GREEN runs the named Codex harness command, git diff --check, npm run factory:check, and npm run verify after the official-only feasibility boundary. |
| `T114-129-REVIEW` | A fresh reviewer requires official evidence or durable unavailable feasibility and verifies no substitute provider is selected before the Task 129 merge gate. |
| `T114-129-OFFICIAL` | Codex support uses only an officially documented non-extractive flow; absent support appends official-flow-unavailable evidence and never extracts a token. |

**Files:**

- Create: `packages/agent/src/codex-subscription-harness.ts`
- Create: `packages/agent/test/codex-subscription-harness.test.ts`
- Create: `docs/agentic/claims/task-129-resident-full-vision-codex-harness.md`

**Consumes:** CF-1's official-flow evidence requirements, exact harness
capability, OS secret/reference contract, and feasibility event owner.
**Produces:** a Codex capability only when an official non-extractive flow is
proven, otherwise append-only `official-flow-unavailable` evidence.

- [ ] **Step 1: Claim, rebase, and write RED tests.**

  Use credential-free fakes to reject cookies, browser/session storage, token
cache, intercepted header, CLI-auth-store, environment token, undocumented
API, reverse-engineered grant, and any subscription token as an API key. The
absent-official-flow case must produce safe `official-flow-unavailable` with no
secret resolution, no request, no provider substitution, and no material in
records/diagnostics. A fake official route may prove interface behavior only;
it cannot claim Codex feasibility.

- [ ] **Step 2: Run RED.**

  ```bash
  npm test -- packages/agent/test/codex-subscription-harness.test.ts
  ```

  Expected: FAIL because `codex-subscription-harness.ts` is absent.

- [ ] **Step 3: Implement official-only feasibility boundary.**

  Model Codex as a provider backend, never a resident identity. Verify current
  policy/capability/reference/mount/run/approval posture and official evidence
  before any harness action. If CF-1 cannot name a supported official flow,
  append safe unavailable feasibility through mounted authority and stop before
  token extraction. This adapter has no token extraction path.

- [ ] **Step 4: Run GREEN, verify, commit, and review.**

  ```bash
  npm test -- packages/agent/test/codex-subscription-harness.test.ts
  git diff --check
  npm run factory:check
  npm run verify
  git add packages/agent/src/codex-subscription-harness.ts packages/agent/test/codex-subscription-harness.test.ts docs/agentic/claims/task-129-resident-full-vision-codex-harness.md
  git commit -m "feat: add official Codex harness feasibility"
  ```

  Fresh review requires official evidence or the durable unavailable result;
  neither outcome can block Nous/BYOK/local readiness.

## Task 130: Official xAI Subscription Harness

| Contract entry | Required local statement |
| --- | --- |
| `T114-130-RED` | RED runs the named xAI harness command before xai-subscription-harness.ts exists and rejects unofficial credential sources. |
| `T114-130-GREEN` | GREEN runs the named xAI harness command, git diff --check, npm run factory:check, and npm run verify after the official-only feasibility boundary. |
| `T114-130-REVIEW` | A fresh reviewer verifies provider-specific official evidence, safe unavailable feasibility, and no fallback before the Task 130 merge gate. |
| `T114-130-OFFICIAL` | xAI support uses only an officially documented non-extractive flow; absent support appends official-flow-unavailable evidence and never extracts a token. |

**Files:**

- Create: `packages/agent/src/xai-subscription-harness.ts`
- Create: `packages/agent/test/xai-subscription-harness.test.ts`
- Create: `docs/agentic/claims/task-130-resident-full-vision-xai-harness.md`

**Consumes:** CF-1's xAI-specific official-flow/capability evidence, OS secret
reference rules, and feasibility event owner. **Produces:** an xAI capability
only for an official non-extractive route, else safe
`official-flow-unavailable` evidence.

- [ ] **Step 1: Claim, rebase, and write RED tests.**

  Mirror the non-extraction fixture for cookies, session data, browser storage,
token caches, CLI-auth stores, headers, undocumented endpoints, reverse-
engineered grants, environment token, and subscription-to-API-key conversion.
Prove a missing official flow returns safe unavailable evidence and does not
call another provider or resolve material.

- [ ] **Step 2: Run RED.**

  ```bash
  npm test -- packages/agent/test/xai-subscription-harness.test.ts
  ```

  Expected: FAIL because `xai-subscription-harness.ts` is absent.

- [ ] **Step 3: Implement xAI-specific official-only boundary.**

  Keep xAI semantics separate from Codex; do not reuse its credential/token
assumptions. Validate exact policy/capability/ref/mount/run/approval and official
evidence. On absent or unsupported official support, append the safe
`official-flow-unavailable` record through mounted authority and stop. It has
no token extraction path and no generic API-key emulation.

- [ ] **Step 4: Run GREEN, verify, commit, and review.**

  ```bash
  npm test -- packages/agent/test/xai-subscription-harness.test.ts
  git diff --check
  npm run factory:check
  npm run verify
  git add packages/agent/src/xai-subscription-harness.ts packages/agent/test/xai-subscription-harness.test.ts docs/agentic/claims/task-130-resident-full-vision-xai-harness.md
  git commit -m "feat: add official xAI harness feasibility"
  ```

  Fresh review verifies provider-specific semantics, durable unavailable
feasibility, no token extraction, and no fallback.

## Task 133 Provider Boundary Consumption And Task 139 Configuration

| Contract entry | Required local statement |
| --- | --- |
| `T114-133-R-OWNER` | R alone owns Task 133 prompt rendering; P does not edit the renderer or consume approval, resolve a secret, or invoke a provider there. |
| `T114-139-P-OWNER` | Task 139 is P's one provider-configuration owner and does not edit the default runtime factory. |
| `T114-139-RED` | RED runs the named Task 139 configuration command before agent-provider-configuration.ts exists and rejects stale, duplicate, secret-bearing, or fallback configuration. |
| `T114-139-GREEN` | GREEN runs the named Task 139 configuration command, git diff --check, npm run factory:check, and npm run verify after the minimal sole-owner configuration change. |
| `T114-139-REVIEW` | A fresh reviewer verifies the sole configuration owner, predecessor rebase evidence, feasibility provenance, and no default-factory edit before the Task 139 merge gate. |
| `T114-139-REBASE` | Task 139 starts only after Tasks 126 through 130 and Task 133 are reviewed and merged, then rebases to every recorded predecessor SHA before review. |

Task 133 is R-owned. R owns
`packages/local-runtime/src/agent-runtime-prompt-renderer.ts` and
`packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts`; P must not
edit either. After Tasks 126--130 merge and R rebases, Task 133 receives only
the frozen P preparation/capability/reference posture. It must reject stale or
swapped provider/model/ref/capability/policy/mount/run/prompt bindings before
rendering `inputText`, and it cannot resolve a secret, invoke a provider, or
consume approval. Its focused command is:

```bash
npm test -- packages/local-runtime/test/agent-runtime-prompt-renderer.test.ts packages/agent/test/prompt-artifacts.test.ts
```

Task 139 starts only after the reviewed Task 126--130 and Task 133 commits are
merged and P rebases to all recorded SHAs. It is the one configuration owner:

- Create: `packages/local-runtime/src/agent-provider-configuration.ts`
- Create: `packages/local-runtime/test/agent-provider-configuration.test.ts`
- Create: `docs/agentic/claims/task-139-resident-full-vision-provider-configuration.md`

Its configuration builds a mounted, immutable `ProviderConfigurationInput` from
the frozen capability/ref/feasibility inputs and the exact OS secret adapter.
It registers no fake test provider for production, does not edit the default
factory, does not invoke an adapter during deterministic setup, and does not
make health/readiness durable authority. It rejects duplicate capability IDs,
provider/model/ref mismatch, stale or superseded feasibility, missing official
evidence, unapproved endpoint policy, secret-shaped values, prototype/accessor
objects, and any config attempting alternate storage or implicit fallback.

- [ ] **Step 1: Write RED configuration tests and run them.**

  ```bash
  npm test -- packages/local-runtime/test/agent-provider-configuration.test.ts packages/agent/test/provider-registry.test.ts
  ```

  Expected: FAIL because `agent-provider-configuration.ts` is absent.

- [ ] **Step 2: Implement after exact rebase, run GREEN, and commit.**

  ```bash
  npm test -- packages/local-runtime/test/agent-provider-configuration.test.ts packages/agent/test/provider-registry.test.ts
  git diff --check
  npm run factory:check
  npm run verify
  git add packages/local-runtime/src/agent-provider-configuration.ts packages/local-runtime/test/agent-provider-configuration.test.ts docs/agentic/claims/task-139-resident-full-vision-provider-configuration.md
  git commit -m "feat: configure resident provider capabilities"
  ```

  Fresh review verifies the one configuration owner, all predecessor/rebase
facts, no factory edit, no test fake in production, registry/feasibility
provenance, and exact preparation handoff to R.

## Deterministic, Live Nous, And Secret-Safety Acceptance

| Contract entry | Required local statement |
| --- | --- |
| `T114-ACCEPT-DETERMINISTIC` | Deterministic suites are credential-free and use only test-process fakes that production configuration rejects. |
| `T114-ACCEPT-LIVE-NOUS` | The coordinator-only live Nous gate runs npm run agent:nous:smoke with real approved OS-stored credentials, independent approval revalidation, and safe hashes, IDs, counts, categories, and readback marker only. |

| Case | Owner | Deterministic proof | Required result |
| --- | --- | --- | --- |
| Typed references and OS resolution | Tasks 126--127 | BYOK/OS-secret tests | Literal, stale, forged, swapped, revoked, accessor, and cross-run refs fail without material, fallback, or I/O. |
| BYOK selection | Task 126 | BYOK/openai-compatible tests | Exact endpoint policy and one selected capability/ref; no portable secret, no fallback, no raw request/prompt. |
| Local model | Task 128 | Local/provider-readiness tests | Explicit `local-engine` + `local-no-secret` posture and budget; never an implicit fallback. |
| Official harnesses | Tasks 129--130 | Codex/xAI harness tests | Absent official support emits `official-flow-unavailable`; no token extraction, cookie/session/CLI-store use, or emulation. |
| Prompt and approval binding | Task 133 (R) | Prompt-renderer/prompt-artifact tests | Exact artifact, run, provider/model/ref, transfer preview, policy, lock, and budget; no secret resolution/call. |
| Configuration and feasibility replay | Task 139 | Configuration/provider-registry tests | One configuration owner registers frozen capability/ref/feasibility posture; superseding evidence rebuilds safely. |
| Real provider reference | Coordinator after Tasks 126--130/133/139 | `npm run agent:nous:smoke` | Use real approved Nous from OS storage after independent transfer approval and fresh mounted handoff readback. |

All deterministic tests are credential-free. Test-only material remains inside
the test process and cannot be production-selected. They scan returned values,
errors, diagnostics, logs, event/projection/DTO JSON, enumerable keys, arrays,
prototypes, accessors, custom serializers, and command/endpoint-shaped fields
for secrets, prompt/evidence text, provider output, OS locations, headers,
cookies, token values, or raw errors.

The real Nous gate runs only in a coordinator-controlled environment after
CF-1, implementation review, and an explicit live authorization. It uses a
real approved Nous credential in OS secret storage, verified mounted authority,
the exact policy-selected model/capability/ref, a bounded advisory workflow,
and independently revalidated `provider-byte-transfer` approval. It emits only
a fixed status marker, provider/model IDs, capability/prompt/input/output/
manifest hashes, safe event/context-pack IDs, counts, categories, and a fresh
readback marker. It emits no credential reference details, credential material,
prompt, evidence, endpoint, headers, raw response, output body, command, or
stack trace. An outage, missing OS binding, or stale approval is an honest
blocked/unavailable result; it is not a pass or a reason to use a substitute.

## Merge, Rebase, Rollback, And Stop Conditions

| Contract entry | Required local statement |
| --- | --- |
| `T114-ROLLBACK-APPEND-ONLY` | Rollback is append-only: append a superseding policy, reference, or feasibility correction and rebuild projections; never delete evidence or restore a fallback store. |
| `T114-STOP-ESCALATE` | Stop for secret or plaintext fallback, unofficial token extraction, mandatory Nous unavailability, ownership conflict, data-loss risk, or two focused verifier failures; return structured evidence to the coordinator. |

1. CF-1 merges first and records every frozen provider/credential/event/parser
   owner. Each Task 126--130 worker rebases to that SHA before RED and again
   before review. Task 133 waits for their merged SHAs; Task 139 waits for
   their reviewed commits plus Task 133, then rebases before its focused suite.
   A stale branch is neither reviewed nor merged.
2. The coordinator records every capability, endpoint-policy, parser, event,
   or feasibility dependency rebase as new registry/claim evidence. P has one
   configuration writer in Task 139 and never changes R's factory, H's
   handoff, W's mount, L's loop budgets, U's DTO boundary, or A's acceptance
   files.
3. Rollback is append-only: never delete a feasibility, invocation, approval,
   revocation, or handoff record; append a superseding policy/ref/feasibility
   correction and rebuild the projection. Disable a capability through later
   policy/evidence, release only process-local material, and classify stale
   records as unavailable/blocked. Never roll back to plaintext, a process
   cache, an alternate provider, or a fallback store.
4. Stop the child and return structured evidence for a shared schema/event/DTO
   or file-owner conflict, secret leak or plaintext fallback, unavailable OS
   backend, mount mismatch, stale/swapped prompt/source/artifact/ref/approval,
   unavailable mandatory Nous gate, required provider invocation during a
   deterministic task, unofficial token/cookie/session/browser/CLI-store
   extraction, data-loss risk, inability to produce durable readback, or a
   verifier failure after two focused repairs. Under standing delegation, the
   coordinator records the root cause and changes tactic/worker; user input is
   needed only for a required product, scope, safety, data-loss, credential, or
   external-behavior decision.
5. This Task 114 plan author does not implement CF-1, start Tasks 126--130,
   Task 133, or Task 139, provision a credential, invoke a provider, dispatch
   a child, self-approve, or merge. There is no merge into neo.

## Plan Self-Review

- [x] Coverage: BYOK, exact OS secret resolution, explicit local execution,
  official Codex/xAI feasibility, mandatory later Nous acceptance, prompt and
  approval binding, configuration, provenance, safe diagnostics, and no
  fallback each map to an exact later task or acceptance row.
- [x] Interface safety: all proposed interfaces are explicitly pre-CF-1; P's
  preparation is distinct from existing compatibility boundaries and cannot
  carry raw prompt/evidence/secret material or approval authority.
- [x] Ownership: Tasks 126--130 and Task 139 have exclusive future files;
  Task 133 is explicitly R-owned; only Task 139 configures providers; no task
  edits a shared registry/factory/boundary without CF-1 assignment.
- [x] Verification: every later implementation task has actual RED/GREEN test
  commands, `git diff --check`, `npm run factory:check`, `npm run verify`,
  fresh review, exact rebase evidence, deterministic credential-free tests,
  and an honest live posture.
- [x] Scope: this plan creates no credential, provider request, prompt/evidence
  transfer, production code, registry edit, configuration change, self-review,
  child dispatch, or merge into `neo`.

## Execution Handoff

After a fresh Task 114 review and coordinator Lane P plan approval, each later
implementation authorization must name this reviewed plan commit, the frozen
CF-1 SHA, exactly one task range, its source/dependency rebase SHA, the wave
stop, GPT-5.6 Terra / Extra High, TDD, fresh review,
verification-before-completion, and no merge into `neo`. Approval of one task
never starts another. The real Nous command remains coordinator-only and needs
its own explicit live-provider authorization after all stated prerequisites.

<!-- TASK136-BOUNDED-ASSURANCE-V1-BEGIN -->
## Task136 Bounded Assurance V1

The program registry remains the lineage authority for Task136 mutable status:
`docs/agentic/resident-agent-full-vision-program-registry.md`, reset event
`RV-1-E-545`.

The active bounded contract is
`docs/agentic/contracts/task136-bounded-assurance-v1.json` and freezes:

- `task136-release-graph.v1`
- `task136-composition-grammar.v1`
- `task136-composition-corpus.v1`

Earlier sections are append-only evidence and are not task-dispatch
instructions. Use only these commands for the bounded Task136 assurance gate:

```bash
node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode contract
node scripts/resident-agent/assurance/task136-bounded-assurance.mjs --mode repository
```
