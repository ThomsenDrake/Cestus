# Provider Readiness Health UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make configured providers, credential-reference health, required approval class, data-handling posture, safe repair actions, and live Nous Portal acceptance visible to the local app/operator without exposing secrets.

**Architecture:** `packages/agent` owns the provider-readiness DTO contract and secret-safe readiness semantics. `packages/local-runtime` owns local provider discovery, local secret-store binding, the live Nous smoke command, and route/status wiring. `packages/ui` renders browser-safe readiness cards from `agent-status.v1` as display-only cockpit state.

**Tech Stack:** TypeScript, Zod, Vitest, Node.js, local-runtime CLI/HTTP handler, React, existing resident-agent provider registry/readiness modules, existing Nous OpenAI-compatible provider adapter, and existing Cestus factory checks.

## Global Constraints

- Live Nous Portal is the authoritative provider/model acceptance path for provider behavior, acceptance checks, smoke tests, and design decisions that depend on model output.
- Deterministic tests remain required for pure contract, redaction, route, and UI behavior, but fake output is not a substitute for live Nous acceptance.
- Source code and local config help may define the supported Nous environment knobs clearly so the app remains operable.
- DTOs, logs, screenshots, claims, diagnostics, snapshots, user-facing cards, and readiness evidence must not expose secret values, raw provider bodies, raw provider errors, auth headers, raw local credential binding locations, or provider response bodies.
- Live smoke output may include only safe metadata: provider ID, model ID, ok or failure category, output hash, and a constrained marker when the provider returns the expected marker.
- Remote provider readiness never implies permission to send private evidence, document bytes, source-identifying context, PRR correspondence, export material, legal language, repair commands, or accepted graph decisions.
- Provider accounts, credentials, subscriptions, harness sessions, and local model processes are execution backends only; they never become the resident Cestus Agent identity.
- The ledger remains append-only, projections remain rebuildable, and provider byte transfer stays human-approved and preview-hash-bound.
- Stop on data-loss risk, schema conflict, unavailable dependency, missing live Nous credential binding, raw provider error leakage, external-service failure after two focused repair attempts, or any path that would bypass provider byte-transfer approval.

---

## Required Context

Implementation workers must read these files before editing:

- `AGENTS.md`
- `.agents/skills/cestus-software-factory/SKILL.md`
- `docs/agentic/software-factory.md`
- `docs/superpowers/specs/2026-06-30-ontology-layer-design.md`
- `docs/superpowers/plans/2026-06-30-ontology-layer-implementation.md`
- `docs/superpowers/specs/2026-07-07-resident-agent-provider-auth-design.md`
- `docs/superpowers/plans/2026-07-07-resident-agent-provider-auth-implementation.md`
- `docs/superpowers/specs/2026-07-07-cestus-resident-agent-design.md`
- `docs/superpowers/specs/2026-07-07-resident-agent-execution-approval-design.md`
- `docs/agentic/claims/task-1-nous-openai-compatible-provider.md`
- `docs/agentic/claims/task-5-provider-auth-readiness-route-cards.md`
- `docs/agentic/claims/final-review-provider-auth-fixes.md`

## File Structure

- Create `packages/local-runtime/src/agent-provider-readiness.ts`: shared local provider discovery, configured Nous capability descriptor, credential-reference construction, secret-store binding, readiness building, and safe live-smoke result helpers.
- Create `packages/local-runtime/test/agent-provider-readiness.test.ts`: deterministic local-runtime tests for configured provider discovery, missing binding, healthy local binding, safe DTO output, and route/status source reuse.
- Modify `packages/agent/src/provider-readiness.ts`: add card fields for credential health and data-handling posture while preserving strict secret-safety checks.
- Modify `packages/agent/src/runtime-types.ts`: keep `providerReadiness` as the typed optional `agent-status.v1` field and align any new DTO fields.
- Modify `packages/agent/test/provider-readiness.test.ts`: add deterministic DTO contract tests for credential health, data posture, byte-transfer gates, and unsafe text rejection.
- Modify `packages/local-runtime/src/agent-http-routes.ts`: use the shared local readiness source for `GET /api/agent/providers/readiness` and include readiness in `GET /api/agent/status`.
- Modify `packages/local-runtime/src/agent-runtime-factory.ts`: reuse the shared configured provider source so runtime invocation providers and readiness providers cannot drift.
- Modify `packages/local-runtime/src/cli.ts`: add a live Nous provider smoke command that emits safe JSON only.
- Create `packages/local-runtime/test/agent-provider-smoke.test.ts`: deterministic smoke-output tests using mocked provider responses and failure paths.
- Modify `packages/local-runtime/test/agent-provider-readiness-routes.test.ts`: route tests for missing and configured Nous readiness without ledger writes.
- Modify `packages/local-runtime/test/agent-http-routes.test.ts`: status tests proving Nous provider readiness appears when configured and stays secret-safe.
- Modify `packages/ui/src/agent/agent-adapter.ts`: parse optional `providerReadiness` and recursively redact unsafe runtime values before parsing.
- Modify `packages/ui/src/agent/provider-setup-cards.ts`: map new safe readiness fields to browser card data and reject unsafe values.
- Modify `packages/ui/src/agent/AgentWorkspace.tsx`: render provider-readiness cards as display-only cockpit state.
- Modify `packages/ui/test/agent-adapter.test.ts`: parser tests for `providerReadiness`.
- Modify `packages/ui/test/agent-provider-setup-cards.test.ts`: browser-card tests for data posture, approval class, credential health, and unsafe text rejection.
- Modify `packages/ui/test/agent-workspace.test.tsx`: DOM tests for displayed readiness and absence of risky execution buttons.
- Modify `package.json`: add a local live-smoke script only if the CLI command needs an npm alias for factory repeatability.
- Modify `docs/agentic/software-factory.md`: append readiness evidence after implementation verification.
- Create or modify `docs/agentic/claims/task-1-provider-readiness-health-ux.md`: durable implementation claim and verification record.

## Task 1: Branch, Claim, And Baseline

**Files:**

- Create: `docs/agentic/claims/task-1-provider-readiness-health-ux.md`

**Interfaces:**

- Consumes: this plan and the existing Cestus factory claim format.
- Produces: a durable task claim with status `claimed`, owned files, commands, and stop conditions.

- [ ] **Step 1: Create the implementation branch**

Run:

```bash
git switch -c codex/provider-readiness-health-ux
```

Expected:

```text
Switched to a new branch 'codex/provider-readiness-health-ux'
```

- [ ] **Step 2: Write the claim file**

Create `docs/agentic/claims/task-1-provider-readiness-health-ux.md`:

```md
# Task 1: Provider Readiness Health UX

- Plan: `docs/superpowers/plans/2026-07-08-provider-readiness-health-ux-implementation.md`
- Active spec: `docs/superpowers/specs/2026-07-07-resident-agent-provider-auth-design.md`
- Branch: `codex/provider-readiness-health-ux`
- Status: claimed
- Claimed at: 2026-07-08T00:00:00Z
- Worker: Codex provider readiness implementation lane

## Owned Files

- `packages/agent/src/provider-readiness.ts`
- `packages/agent/src/runtime-types.ts`
- `packages/agent/test/provider-readiness.test.ts`
- `packages/local-runtime/src/agent-provider-readiness.ts`
- `packages/local-runtime/src/agent-http-routes.ts`
- `packages/local-runtime/src/agent-runtime-factory.ts`
- `packages/local-runtime/src/cli.ts`
- `packages/local-runtime/test/agent-provider-readiness.test.ts`
- `packages/local-runtime/test/agent-provider-readiness-routes.test.ts`
- `packages/local-runtime/test/agent-provider-smoke.test.ts`
- `packages/local-runtime/test/agent-http-routes.test.ts`
- `packages/ui/src/agent/agent-adapter.ts`
- `packages/ui/src/agent/provider-setup-cards.ts`
- `packages/ui/src/agent/AgentWorkspace.tsx`
- `packages/ui/test/agent-adapter.test.ts`
- `packages/ui/test/agent-provider-setup-cards.test.ts`
- `packages/ui/test/agent-workspace.test.tsx`
- `package.json`
- `docs/agentic/software-factory.md`
- `docs/agentic/claims/task-1-provider-readiness-health-ux.md`

## Acceptance Criteria

- Local runtime readiness reflects configured Nous Portal state from local runtime bindings.
- Live Nous smoke is the authoritative provider/model acceptance proof.
- Browser and HTTP DTOs expose only safe provider metadata, credential-reference health, approval class, data posture, and opaque repair actions.
- Remote Nous readiness remains provider-byte-transfer gated.
- No API key, auth header, raw provider body, raw provider error, local credential binding path, or provider response body appears in DTOs, diagnostics, logs, snapshots, user-facing cards, claims, or readiness evidence.

## Verification Plan

- `npm test -- packages/agent/test/provider-readiness.test.ts packages/local-runtime/test/agent-provider-readiness.test.ts packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/agent-provider-smoke.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-provider-setup-cards.test.ts packages/ui/test/agent-workspace.test.tsx`
- `npm run local:agent:provider-smoke -- --json`
- `npm run verify`
- `git diff --check`
- `npm run factory:check`

## Stop Conditions

- Missing live Nous credential binding.
- Raw provider error or response body would be serialized.
- Secret-shaped text appears in a DTO, diagnostic, log, user-facing card, claim, snapshot, or readiness evidence.
- Provider byte-transfer approval is weakened or implied by readiness.
- A verifier fails after two focused repair attempts.
```

- [ ] **Step 3: Commit the claim**

Run:

```bash
git add docs/agentic/claims/task-1-provider-readiness-health-ux.md
git commit -m "chore: claim provider readiness health ux task"
```

Expected:

```text
[codex/provider-readiness-health-ux ...] chore: claim provider readiness health ux task
```

## Task 2: Provider Readiness DTO Contract

**Files:**

- Modify: `packages/agent/src/provider-readiness.ts`
- Modify: `packages/agent/src/runtime-types.ts`
- Modify: `packages/agent/test/provider-readiness.test.ts`

**Interfaces:**

- Consumes: `ProviderCapabilityDescriptor`, `AgentCredentialReference`, `SecretStore`, `providerReadinessDtoSchema`.
- Produces:

```ts
export const providerCredentialHealthSchema = z.enum([
  "local-binding-healthy",
  "local-binding-missing",
  "expired",
  "revoked",
  "insufficient-scope",
  "unverified",
  "not-required"
]);

export const providerDataHandlingPostureSchema = z.enum([
  "local-only",
  "remote-prompt-byte-transfer-gated",
  "remote-workspace-harness-gated",
  "policy-blocked"
]);
```

`ProviderSetupCard` must include:

```ts
readonly credentialHealth: ProviderCredentialHealth;
readonly dataHandlingPosture: ProviderDataHandlingPosture;
readonly credentialRefId?: string | undefined;
```

- [ ] **Step 1: Write failing DTO tests**

Add these tests to `packages/agent/test/provider-readiness.test.ts`:

```ts
it("reports credential health and data posture for a configured remote provider", async () => {
  const registry = createProviderRegistry();
  registry.register({
    providerId: "provider_nous_portal",
    label: "Nous Portal",
    adapterVersion: "openai-compatible-chat.v1",
    backendKind: "openai-compatible-api",
    modelFamilies: ["tencent/hy3:free"],
    modalities: ["text"],
    toolSupport: "none",
    structuredOutputSupport: "unsupported",
    contextLimits: { maxInputTokens: 4096, maxOutputTokens: 1024 },
    credentialRequirements: [{ credentialKind: "api-key-bearer", required: true }],
    dataHandlingNotes: "Remote Nous Portal provider. Prompts leave this machine only after provider policy allows it.",
    costPolicy: "metered-api",
    workspaceScopes: ["workspace"],
    approvalProfile: "remote-byte-transfer-gated",
    diagnosticContract: ["provider-ready", "requires-byte-transfer-approval"],
    fakeSupport: false
  });
  const store = new FakeSecretStore();
  await store.putForTest("agent_credref_nous_portal", SecretMaterial.fromTestValue("runtime-provider-material"));

  const dto = await buildProviderReadiness({
    registry,
    credentialReferences: [
      createCredentialReference({
        credentialRefId: "agent_credref_nous_portal",
        providerId: "provider_nous_portal",
        credentialKind: "api-key-bearer",
        scopeKind: "machine",
        capabilityScopes: ["model-inference", "provider-health"],
        safeLabel: "Nous Portal local binding",
        authorizedBy: "actor_local_operator",
        authorizedAt: "2026-07-08T12:00:00.000Z",
        policyVersion: "agent-provider-auth.v1",
        status: "linked"
      })
    ],
    secretStore: store,
    now: () => "2026-07-08T12:05:00.000Z"
  });

  expect(dto.cards.find((card) => card.providerId === "provider_nous_portal")).toMatchObject({
    state: "requires-byte-transfer-approval",
    requiredApprovalClass: "provider-byte-transfer",
    credentialHealth: "local-binding-healthy",
    dataHandlingPosture: "remote-prompt-byte-transfer-gated",
    credentialRefId: "agent_credref_nous_portal"
  });
  expect(JSON.stringify(dto)).not.toMatch(/runtime-provider-material|authorization:\s*bearer|provider error|response body/i);
});
```

- [ ] **Step 2: Run the targeted failing test**

Run:

```bash
npm test -- packages/agent/test/provider-readiness.test.ts
```

Expected before implementation:

```text
credentialHealth
```

- [ ] **Step 3: Extend DTO schemas and builders**

Modify `packages/agent/src/provider-readiness.ts`:

```ts
export const providerCredentialHealthSchema = z.enum([
  "local-binding-healthy",
  "local-binding-missing",
  "expired",
  "revoked",
  "insufficient-scope",
  "unverified",
  "not-required"
]);

export const providerDataHandlingPostureSchema = z.enum([
  "local-only",
  "remote-prompt-byte-transfer-gated",
  "remote-workspace-harness-gated",
  "policy-blocked"
]);
```

Add these fields to `providerSetupCardSchema`:

```ts
credentialHealth: providerCredentialHealthSchema,
dataHandlingPosture: providerDataHandlingPostureSchema,
credentialRefId: credentialRefIdSchema.optional()
```

Map readiness state to credential health:

```ts
function credentialHealthForEvaluation(
  descriptor: ProviderCapabilityDescriptor,
  evaluation: ProviderReadinessEvaluation
): ProviderCredentialHealth {
  if (requiresOnlyLocalNoSecret(descriptor)) {
    return "not-required";
  }
  if (evaluation.state === "credential-expired") {
    return "expired";
  }
  if (evaluation.state === "credential-revoked") {
    return "revoked";
  }
  if (evaluation.state === "insufficient-scope") {
    return "insufficient-scope";
  }
  if (evaluation.state === "needs-api-key" || evaluation.state === "credential-binding-missing") {
    return "local-binding-missing";
  }
  if (evaluation.state === "health-unverified") {
    return "unverified";
  }
  return evaluation.credentialRefId === undefined ? "unverified" : "local-binding-healthy";
}
```

Map provider approval profile to data posture:

```ts
function dataHandlingPostureFor(
  approvalProfile: ProviderApprovalProfile
): ProviderDataHandlingPosture {
  if (approvalProfile === "local-only") {
    return "local-only";
  }
  if (approvalProfile === "harness-workspace-gated") {
    return "remote-workspace-harness-gated";
  }
  return "remote-prompt-byte-transfer-gated";
}
```

Keep the existing recursive secret-safety assertion over the full DTO.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/provider-readiness.test.ts
```

Expected:

```text
Test Files  1 passed
```

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/agent/src/provider-readiness.ts packages/agent/src/runtime-types.ts packages/agent/test/provider-readiness.test.ts
git commit -m "feat: extend provider readiness health dto"
```

## Task 3: Local Runtime Configured Provider Readiness

**Files:**

- Create: `packages/local-runtime/src/agent-provider-readiness.ts`
- Modify: `packages/local-runtime/src/agent-runtime-factory.ts`
- Create: `packages/local-runtime/test/agent-provider-readiness.test.ts`

**Interfaces:**

- Consumes: `loadLocalAgentEnv`, `createNousPortalProvider`, `StaticSecretStore`, `SecretMaterial`, `createProviderRegistry`, `createCredentialReference`, `buildProviderReadiness`.
- Produces:

```ts
export interface LocalAgentProviderConfiguration {
  readonly providers: readonly ModelProviderAdapter[];
  readonly readinessRegistry: ProviderCapabilityRegistry;
  readonly credentialReferences: readonly AgentCredentialReference[];
  readonly secretStore: SecretStore;
}

export function createLocalAgentProviderConfiguration(input: {
  readonly cwd: string;
  readonly now: () => string;
  readonly resolveInputText: (inputArtifactHash: string) => string | Promise<string>;
  readonly env?: Record<string, string | undefined>;
}): LocalAgentProviderConfiguration;

export function buildLocalAgentProviderReadiness(input: {
  readonly cwd: string;
  readonly now: () => string;
  readonly env?: Record<string, string | undefined>;
}): Promise<ProviderReadinessDto>;
```

- [ ] **Step 1: Write failing local readiness tests**

Create `packages/local-runtime/test/agent-provider-readiness.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildLocalAgentProviderReadiness,
  createLocalAgentProviderConfiguration
} from "../src/agent-provider-readiness.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("local agent provider readiness", () => {
  it("reports Nous as missing local binding when not configured", async () => {
    const dto = await buildLocalAgentProviderReadiness({
      cwd: tempDir(),
      env: {},
      now: () => "2026-07-08T12:10:00.000Z"
    });

    const nousCard = dto.cards.find((card) => card.providerId === "provider_nous_portal");
    expect(nousCard).toMatchObject({
      state: "needs-api-key",
      credentialHealth: "local-binding-missing",
      dataHandlingPosture: "remote-prompt-byte-transfer-gated",
      requiredApprovalClass: "provider-byte-transfer"
    });
    expect(JSON.stringify(dto)).not.toMatch(/authorization:\s*bearer|provider error|response body|runtime-provider-material/i);
  });

  it("reports configured Nous as locally bound while keeping byte transfer gated", async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, ".env"), [
      "CESTUS_AGENT_NOUS_API_KEY=runtime-provider-material",
      "CESTUS_AGENT_NOUS_ENDPOINT=https://inference-api.nousresearch.com/v1/chat/completions",
      "CESTUS_AGENT_NOUS_MODEL=tencent/hy3:free"
    ].join("\n"));

    const dto = await buildLocalAgentProviderReadiness({
      cwd,
      env: {},
      now: () => "2026-07-08T12:10:00.000Z"
    });

    const nousCard = dto.cards.find((card) => card.providerId === "provider_nous_portal");
    expect(nousCard).toMatchObject({
      label: "Nous Portal",
      state: "requires-byte-transfer-approval",
      credentialHealth: "local-binding-healthy",
      dataHandlingPosture: "remote-prompt-byte-transfer-gated",
      requiredApprovalClass: "provider-byte-transfer",
      credentialRefId: "agent_credref_nous_portal"
    });
    expect(JSON.stringify(dto)).not.toMatch(/runtime-provider-material|authorization:\s*bearer|provider error|response body/i);
  });

  it("uses the same configured provider source for runtime adapters and readiness", () => {
    const configured = createLocalAgentProviderConfiguration({
      cwd: tempDir(),
      env: { CESTUS_AGENT_NOUS_API_KEY: "runtime-provider-material" },
      now: () => "2026-07-08T12:10:00.000Z",
      resolveInputText: () => "safe prompt"
    });

    expect(configured.providers.map((provider) => provider.describe().providerId)).toContain("provider_nous_portal");
    expect(configured.readinessRegistry.list().map((provider) => provider.providerId)).toContain("provider_nous_portal");
    expect(configured.credentialReferences.map((ref) => ref.credentialRefId)).toContain("agent_credref_nous_portal");
    expect(JSON.stringify(configured.readinessRegistry.list())).not.toMatch(/runtime-provider-material/i);
  });
});

function tempDir(): string {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-agent-provider-readiness-"));
  tempDirs.push(cwd);
  return cwd;
}
```

- [ ] **Step 2: Run the targeted failing test**

Run:

```bash
npm test -- packages/local-runtime/test/agent-provider-readiness.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/agent-provider-readiness.js"
```

- [ ] **Step 3: Implement configured provider source**

Create `packages/local-runtime/src/agent-provider-readiness.ts` with the interfaces from this task. Implementation requirements:

- Always register the deterministic local fake provider for fallback local behavior.
- Always register the Nous Portal descriptor in readiness so missing local binding is visible.
- Add the Nous `ModelProviderAdapter` only when the local binding exists.
- Add the Nous credential reference when the provider is configured or when reporting a known missing binding. Use safe label `Nous Portal local binding`, safe actor `actor_local_operator`, policy version `agent-provider-auth.v1`, scope `machine`, and capability scopes `model-inference` and `provider-health`.
- Store the actual key only in `StaticSecretStore` as `SecretMaterial.fromRuntimeValue(...)`.
- Reuse `providerDescriptorToCapabilityDescriptor(createNousPortalProvider(...).describe())` or an equivalent descriptor derived from the real provider adapter. Do not duplicate model ID defaults in a way that can drift from `createNousPortalProvider`.
- Preserve source-code support for the configured local environment knobs already handled by `loadLocalAgentEnv`.

Modify `packages/local-runtime/src/agent-runtime-factory.ts` so `defaultLocalAgentRuntimeFactory()` consumes `createLocalAgentProviderConfiguration()` and passes `configured.providers` to `createAgentRuntime()`.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- packages/local-runtime/test/agent-provider-readiness.test.ts packages/local-runtime/test/agent-http-routes.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/local-runtime/src/agent-provider-readiness.ts packages/local-runtime/src/agent-runtime-factory.ts packages/local-runtime/test/agent-provider-readiness.test.ts packages/local-runtime/test/agent-http-routes.test.ts
git commit -m "feat: build configured agent provider readiness"
```

## Task 4: Runtime Readiness Routes And Status Wiring

**Files:**

- Modify: `packages/local-runtime/src/agent-http-routes.ts`
- Modify: `packages/local-runtime/test/agent-provider-readiness-routes.test.ts`
- Modify: `packages/local-runtime/test/agent-http-routes.test.ts`

**Interfaces:**

- Consumes: `buildLocalAgentProviderReadiness()`.
- Produces: `GET /api/agent/providers/readiness` and `GET /api/agent/status` responses that include configured Nous readiness.

- [ ] **Step 1: Write failing route/status tests**

Add to `packages/local-runtime/test/agent-provider-readiness-routes.test.ts`:

```ts
it("returns configured Nous readiness from the local runtime without ledger writes", async () => {
  const { handler, config } = testHandler({
    env: { CESTUS_AGENT_NOUS_API_KEY: "runtime-provider-material" }
  });

  const response = await handler({ method: "GET", url: "/api/agent/providers/readiness" });
  const body = JSON.parse(response.body) as {
    readonly cards: readonly Array<{
      readonly providerId: string;
      readonly state: string;
      readonly credentialHealth: string;
      readonly requiredApprovalClass: string;
    }>;
  };

  expect(response.status).toBe(200);
  expect(body.cards).toEqual(expect.arrayContaining([
    expect.objectContaining({
      providerId: "provider_nous_portal",
      state: "requires-byte-transfer-approval",
      credentialHealth: "local-binding-healthy",
      requiredApprovalClass: "provider-byte-transfer"
    })
  ]));
  expect(response.body).not.toMatch(/runtime-provider-material|authorization:\s*bearer|provider error|response body/i);
  closeHandler(handler);
  expect(await eventTypes(config)).toEqual([]);
});
```

Add to `packages/local-runtime/test/agent-http-routes.test.ts`:

```ts
it("includes provider readiness in agent status for configured Nous", async () => {
  const config = resolveLocalRuntimeConfig({
    cwd: tempDir(),
    env: { CESTUS_AGENT_NOUS_API_KEY: "runtime-provider-material" }
  });
  const handler = testHandler({ config });

  const response = await handler({ method: "GET", url: "/api/agent/status" });
  const body = JSON.parse(response.body) as {
    readonly providerReadiness?: {
      readonly cards: readonly Array<{
        readonly providerId: string;
        readonly credentialHealth: string;
        readonly dataHandlingPosture: string;
      }>;
    };
  };

  expect(response.status).toBe(200);
  expect(body.providerReadiness?.cards).toEqual(expect.arrayContaining([
    expect.objectContaining({
      providerId: "provider_nous_portal",
      credentialHealth: "local-binding-healthy",
      dataHandlingPosture: "remote-prompt-byte-transfer-gated"
    })
  ]));
  expect(response.body).not.toMatch(/runtime-provider-material|authorization:\s*bearer|provider error|response body/i);
});
```

- [ ] **Step 2: Run targeted failing tests**

Run:

```bash
npm test -- packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts
```

Expected before implementation:

```text
credentialHealth
```

- [ ] **Step 3: Wire routes**

Modify `packages/local-runtime/src/agent-http-routes.ts`:

- Replace the fake-only readiness route with `buildLocalAgentProviderReadiness({ cwd: input.handle.config.cwd, now: input.now })`.
- For `GET /api/agent/status`, load `runtime.status()`, load `buildLocalAgentProviderReadiness(...)`, and return `{ ...status, providerReadiness }`.
- Preserve existing local-runtime auth behavior from `http-handler.ts`.
- Keep route failures generic: `Agent runtime route failed.` with existing safe repair actions.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- packages/local-runtime/test/agent-provider-readiness.test.ts packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/local-runtime/src/agent-http-routes.ts packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts
git commit -m "feat: expose configured provider readiness"
```

## Task 5: Safe Live Nous Smoke

**Files:**

- Create: `packages/local-runtime/src/agent-provider-smoke.ts`
- Modify: `packages/local-runtime/src/cli.ts`
- Modify: `package.json`
- Create: `packages/local-runtime/test/agent-provider-smoke.test.ts`

**Interfaces:**

- Consumes: `createLocalAgentProviderConfiguration`, `createNousPortalProvider`, the local ignored `.env` or runtime environment, and the existing Nous provider adapter.
- Produces:

```ts
export const agentProviderSmokeResultSchema = z.object({
  schemaVersion: z.literal("agent-provider-smoke.v1"),
  providerId: z.literal("provider_nous_portal"),
  modelId: z.string().min(1),
  ok: z.boolean(),
  category: z.enum([
    "ok",
    "credential-missing",
    "auth-rejected",
    "network-timeout",
    "provider-unavailable",
    "model-output-invalid",
    "unexpected-provider-output",
    "provider-smoke-failed"
  ]),
  outputHash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
  marker: z.literal("cestus-live-provider-ok").optional(),
  diagnostic: z.object({
    message: z.string().min(1),
    allowedRepairActions: z.array(z.string().min(1))
  }).optional()
}).strict();
```

- [ ] **Step 1: Write deterministic smoke-result tests**

Create `packages/local-runtime/test/agent-provider-smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  agentProviderSmokeResultSchema,
  sanitizeProviderSmokeFailure,
  smokeResultFromProviderOutput
} from "../src/agent-provider-smoke.js";

describe("agent provider smoke result", () => {
  it("returns only safe metadata for a successful constrained marker", () => {
    const result = smokeResultFromProviderOutput({
      providerId: "provider_nous_portal",
      modelId: "tencent/hy3:free",
      outputText: "cestus-live-provider-ok"
    });

    expect(agentProviderSmokeResultSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      ok: true,
      category: "ok",
      marker: "cestus-live-provider-ok",
      providerId: "provider_nous_portal",
      modelId: "tencent/hy3:free"
    });
    expect(result.outputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toMatch(/authorization:\s*bearer|provider error|response body|runtime-provider-material/i);
  });

  it("sanitizes live provider failures without raw provider error serialization", () => {
    const result = sanitizeProviderSmokeFailure({
      providerId: "provider_nous_portal",
      modelId: "tencent/hy3:free",
      category: "provider-smoke-failed",
      error: new Error("Authorization: Bearer runtime-provider-material rejected by raw provider body")
    });

    expect(agentProviderSmokeResultSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      ok: false,
      category: "provider-smoke-failed",
      diagnostic: {
        message: "Live provider smoke failed.",
        allowedRepairActions: ["run local provider troubleshooting", "inspect local Nous provider configuration"]
      }
    });
    expect(JSON.stringify(result)).not.toMatch(/runtime-provider-material|authorization:\s*bearer|raw provider body|rejected/i);
  });
});
```

- [ ] **Step 2: Run targeted failing test**

Run:

```bash
npm test -- packages/local-runtime/test/agent-provider-smoke.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/agent-provider-smoke.js"
```

- [ ] **Step 3: Implement smoke helper and CLI command**

Create `packages/local-runtime/src/agent-provider-smoke.ts`:

- Prompt: `Reply with exactly cestus-live-provider-ok and no other text.`
- Use `createLocalAgentProviderConfiguration()` and select `provider_nous_portal`.
- Invoke the actual Nous adapter with `credentialRefId: "agent_credref_nous_portal"`, `providerId: "provider_nous_portal"`, `kind: "api-key-bearer"`, model family from the provider descriptor, and a deterministic safe input artifact hash.
- Return only `agent-provider-smoke.v1` JSON.
- On missing local binding, return category `credential-missing`.
- On provider or parse failure, return safe category `provider-smoke-failed` unless the implementation can classify the error without reading or serializing raw provider response bodies.
- Never include raw provider errors, response body text, request body text, prompt bytes, auth headers, local secret values, or local credential binding paths in the result.

Modify `packages/local-runtime/src/cli.ts` to add a command:

```bash
tsx packages/local-runtime/src/cli.ts agent-provider-smoke --json
```

Modify `package.json`:

```json
"local:agent:provider-smoke": "tsx packages/local-runtime/src/cli.ts agent-provider-smoke"
```

- [ ] **Step 4: Run deterministic tests**

Run:

```bash
npm test -- packages/local-runtime/test/agent-provider-smoke.test.ts
```

Expected:

```text
Test Files  1 passed
```

- [ ] **Step 5: Run live Nous smoke**

Run:

```bash
npm run local:agent:provider-smoke -- --json
```

Expected success shape:

```json
{
  "schemaVersion": "agent-provider-smoke.v1",
  "providerId": "provider_nous_portal",
  "modelId": "tencent/hy3:free",
  "ok": true,
  "category": "ok",
  "outputHash": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "marker": "cestus-live-provider-ok"
}
```

The actual output hash value may differ; it must match `^sha256:[a-f0-9]{64}$`.

Expected failure shape:

```json
{
  "schemaVersion": "agent-provider-smoke.v1",
  "providerId": "provider_nous_portal",
  "modelId": "tencent/hy3:free",
  "ok": false,
  "category": "provider-smoke-failed",
  "diagnostic": {
    "message": "Live provider smoke failed.",
    "allowedRepairActions": ["run local provider troubleshooting", "inspect local Nous provider configuration"]
  }
}
```

If the failure shape appears twice after focused repair, stop and escalate. Do not paste raw provider errors into the claim, docs, or final handoff.

- [ ] **Step 6: Commit**

Run:

```bash
git add package.json packages/local-runtime/src/agent-provider-smoke.ts packages/local-runtime/src/cli.ts packages/local-runtime/test/agent-provider-smoke.test.ts
git commit -m "feat: add safe live nous provider smoke"
```

## Task 6: Browser Readiness Cards

**Files:**

- Modify: `packages/ui/src/agent/agent-adapter.ts`
- Modify: `packages/ui/src/agent/provider-setup-cards.ts`
- Modify: `packages/ui/src/agent/AgentWorkspace.tsx`
- Modify: `packages/ui/test/agent-adapter.test.ts`
- Modify: `packages/ui/test/agent-provider-setup-cards.test.ts`
- Modify: `packages/ui/test/agent-workspace.test.tsx`

**Interfaces:**

- Consumes: `AgentStatusDto.providerReadiness`, `providerSetupCardsFromReadiness()`.
- Produces: display-only provider readiness UI with card fields for provider label, provider ID, state, credential health, data posture, required approval class, capability summary, and safe repair actions.

- [ ] **Step 1: Write failing UI adapter and workspace tests**

Add to `packages/ui/test/agent-adapter.test.ts`:

```ts
it("parses provider readiness in agent status without leaking unsafe runtime fields", () => {
  const status = agentStatusFromJson(agentStatus({
    providerReadiness: {
      schemaVersion: "agent-provider-readiness.v1",
      generatedAt: "2026-07-08T12:15:00.000Z",
      cards: [{
        providerId: "provider_nous_portal",
        label: "Nous Portal",
        backendKind: "openai-compatible-api",
        state: "requires-byte-transfer-approval",
        capabilitySummary: ["text", "unsupported", "no tools"],
        credentialKindSummary: ["api-key-bearer"],
        credentialHealth: "local-binding-healthy",
        dataHandlingPosture: "remote-prompt-byte-transfer-gated",
        credentialRefId: "agent_credref_nous_portal",
        requiredApprovalClass: "provider-byte-transfer",
        safeActionIds: ["action_request_provider_byte_transfer_approval"]
      }],
      diagnostics: []
    }
  }));

  expect(status.providerReadiness?.cards[0]).toMatchObject({
    providerId: "provider_nous_portal",
    credentialHealth: "local-binding-healthy"
  });
  expect(JSON.stringify(status)).not.toMatch(/authorization:\s*bearer|provider error|response body|runtime-provider-material/i);
});
```

Add to `packages/ui/test/agent-workspace.test.tsx`:

```ts
it("renders provider readiness cards as display-only cockpit state", () => {
  render(<AgentWorkspace status={agentStatus({
    providerReadiness: {
      schemaVersion: "agent-provider-readiness.v1",
      generatedAt: "2026-07-08T12:15:00.000Z",
      cards: [{
        providerId: "provider_nous_portal",
        label: "Nous Portal",
        backendKind: "openai-compatible-api",
        state: "requires-byte-transfer-approval",
        capabilitySummary: ["text", "unsupported", "no tools"],
        credentialKindSummary: ["api-key-bearer"],
        credentialHealth: "local-binding-healthy",
        dataHandlingPosture: "remote-prompt-byte-transfer-gated",
        credentialRefId: "agent_credref_nous_portal",
        requiredApprovalClass: "provider-byte-transfer",
        safeActionIds: ["action_request_provider_byte_transfer_approval"]
      }],
      diagnostics: []
    }
  })} loadState="loaded" onRefresh={vi.fn()} />);

  const readiness = screen.getByRole("region", { name: "Provider readiness" });
  expect(within(readiness).getByText("Nous Portal")).toBeInTheDocument();
  expect(within(readiness).getByText("local-binding-healthy")).toBeInTheDocument();
  expect(within(readiness).getByText("remote-prompt-byte-transfer-gated")).toBeInTheDocument();
  expect(within(readiness).getByText("provider-byte-transfer")).toBeInTheDocument();
  expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Refresh agent status"]);
});
```

- [ ] **Step 2: Run targeted failing tests**

Run:

```bash
npm test -- packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-provider-setup-cards.test.ts packages/ui/test/agent-workspace.test.tsx
```

Expected before implementation:

```text
providerReadiness
```

- [ ] **Step 3: Implement UI parsing and rendering**

Modify `packages/ui/src/agent/agent-adapter.ts`:

- Import or mirror the provider-readiness schema safely.
- Add optional `providerReadiness` to `agentStatusDtoSchema`.
- Preserve recursive `safeAgentValue()` redaction before parsing.

Modify `packages/ui/src/agent/provider-setup-cards.ts`:

- Include `credentialHealth`, `dataHandlingPosture`, and `credentialRefId` in `safeProviderSetupCardSchema`.
- Keep `safeActionIds` restricted to known opaque action IDs.
- Reject raw env-shaped action IDs, raw credential locations, raw provider error wording, and response body labels.

Modify `packages/ui/src/agent/AgentWorkspace.tsx`:

- Add `<section aria-label="Provider readiness">`.
- Render cards from `status.providerReadiness` when available.
- Show state, credential health, data posture, required approval class, capability summary, and safe action IDs as inert text.
- Do not add buttons other than the existing refresh button.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
npm test -- packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-provider-setup-cards.test.ts packages/ui/test/agent-workspace.test.tsx
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 5: Commit**

Run:

```bash
git add packages/ui/src/agent/agent-adapter.ts packages/ui/src/agent/provider-setup-cards.ts packages/ui/src/agent/AgentWorkspace.tsx packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-provider-setup-cards.test.ts packages/ui/test/agent-workspace.test.tsx
git commit -m "feat: render provider readiness cards"
```

## Task 7: Verification And Readiness Evidence

**Files:**

- Modify: `docs/agentic/software-factory.md`
- Modify: `docs/agentic/claims/task-1-provider-readiness-health-ux.md`

**Interfaces:**

- Consumes: targeted test output, live smoke safe JSON, full verification output.
- Produces: additive readiness evidence with no raw secrets, raw provider body, raw provider error, auth header, local credential path, or provider response body.

- [ ] **Step 1: Run focused verification**

Run:

```bash
npm test -- packages/agent/test/provider-readiness.test.ts packages/local-runtime/test/agent-provider-readiness.test.ts packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/agent-provider-smoke.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-provider-setup-cards.test.ts packages/ui/test/agent-workspace.test.tsx
```

Expected:

```text
Test Files  8 passed
```

- [ ] **Step 2: Run live Nous acceptance smoke**

Run:

```bash
npm run local:agent:provider-smoke -- --json
```

Expected:

```text
"schemaVersion":"agent-provider-smoke.v1"
"providerId":"provider_nous_portal"
"ok":true
"category":"ok"
"marker":"cestus-live-provider-ok"
```

Record only the safe fields above plus the output hash. Do not record the prompt, response body, raw provider error, raw request body, raw auth header, or local credential binding.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run verify
```

Expected:

```text
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

- [ ] **Step 4: Check whitespace**

Run:

```bash
git diff --check
```

Expected:

```text
no output
```

- [ ] **Step 5: Record readiness evidence**

Append this section shape to `docs/agentic/software-factory.md`:

````md
## Provider Readiness Health UX Implementation Readiness

The provider readiness health UX slice was implemented from the approved resident-agent provider/auth design and the live Nous provider correction on 2026-07-08.

Required design and plan files:

- `docs/superpowers/specs/2026-07-07-resident-agent-provider-auth-design.md`
- `docs/superpowers/plans/2026-07-08-provider-readiness-health-ux-implementation.md`

Recorded focused verification:

```text
npm test -- packages/agent/test/provider-readiness.test.ts packages/local-runtime/test/agent-provider-readiness.test.ts packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/local-runtime/test/agent-http-routes.test.ts packages/local-runtime/test/agent-provider-smoke.test.ts packages/ui/test/agent-adapter.test.ts packages/ui/test/agent-provider-setup-cards.test.ts packages/ui/test/agent-workspace.test.tsx
Test Files  8 passed
```

Recorded live Nous smoke:

```text
schemaVersion agent-provider-smoke.v1
providerId provider_nous_portal
modelId tencent/hy3:free
ok true
category ok
marker cestus-live-provider-ok
outputHash sha256 followed by 64 lowercase hex characters
```

Recorded full verification:

```text
npm run verify
typecheck passed
tests passed
vite build succeeded
factory-readiness passed
```

This slice uses live Nous as the authoritative provider/model acceptance path. Deterministic tests cover DTO contracts, redaction, route safety, and UI rendering. Readiness remains display-only and byte-transfer-gated; it does not approve private evidence transfer or any other risky effect.
````

Also update the claim status to `ready-for-review` and include the same safe evidence.

- [ ] **Step 6: Run factory check**

Run:

```bash
npm run factory:check
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 7: Commit readiness evidence**

Run:

```bash
git add docs/agentic/software-factory.md docs/agentic/claims/task-1-provider-readiness-health-ux.md
git commit -m "docs: record provider readiness health ux"
```

## Final Review Gates

After Task 7 commits, request two reviews before merge:

- Spec review: check provider/auth design alignment, live Nous correction, byte-transfer gate language, source/config operability, and absence of provider/backend identity confusion.
- Code-quality review: check test coverage, DTO schemas, route wiring, live smoke safe output, UI display-only behavior, and secret-safety adversarial cases.

Reviewers must lead with defects, missing tests, spec drift, invariant violations, and verification gaps. The implementation is complete only when focused verification, live Nous smoke, `npm run verify`, `git diff --check`, and `npm run factory:check` pass.

## Completion Criteria

- Configured Nous appears in provider readiness from the local runtime.
- Missing local binding is visible as `needs-api-key` with safe repair actions.
- Healthy local binding is visible as `local-binding-healthy`.
- Nous readiness remains `requires-byte-transfer-approval` with `provider-byte-transfer` required approval class.
- Agent status carries browser-safe `providerReadiness`.
- Agent workspace renders provider readiness as display-only cockpit state.
- Live Nous smoke returns safe metadata with marker `cestus-live-provider-ok` and an output hash.
- Live smoke failures return generic Cestus diagnostics and local-only troubleshooting actions.
- Deterministic tests cover contracts, redaction, route behavior, and UI rendering.
- No secret values, auth headers, raw provider bodies, raw provider errors, local credential binding paths, screenshots, snapshots, user-facing cards, claims, diagnostics, logs, or readiness evidence leak sensitive material.
- Source code and local config help remain clear enough for operators to configure the supported Nous environment knobs.
