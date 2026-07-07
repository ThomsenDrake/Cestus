# Resident Agent Provider/Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first secret-free provider/auth slice for the resident Cestus Agent: credential references, provider registry/readiness DTOs, secret-store interfaces, and fake provider health tests without live provider calls.

**Architecture:** The resident-agent foundation remains the base. `packages/agent` owns provider descriptors, credential references, secret-store interfaces, readiness projections, fake providers, and safe DTOs. Local runtime and UI consume browser-safe DTOs only; secret material stays in OS keyring, local encrypted store, enterprise secret manager, or approved process environment outside ledger and portable workspace state.

**Tech Stack:** TypeScript, Zod, Vitest, existing ontology `EventLedger`, resident-agent foundation package, local-runtime HTTP handler, React browser adapters, and Cestus secret-safe diagnostic patterns.

---

## Prerequisites

This plan assumes the resident-agent foundation plan has landed or is available
in the implementation worktree:

- `packages/agent/src/provider.ts`
- `packages/agent/src/secret-safety.ts`
- `packages/agent/src/runtime-types.ts`
- `packages/agent/src/runtime.ts`
- `packages/local-runtime/src/agent-runtime-factory.ts`
- `packages/ui/src/agent/agent-adapter.ts`

If those files are absent, stop and coordinate with the resident-agent
foundation branch before editing.

## Scope Boundary

Included:

- Secret-free credential reference schemas and tests.
- Secret-store interface and fake in-memory resolver.
- Provider capability registry and readiness DTOs.
- Fake provider health checks for ready, missing binding, expired, unsupported
  model, and approval-required states.
- Local runtime read-only readiness route.
- Browser-safe provider setup cards.
- Factory validation and docs readiness.

Deferred to separate approved plans:

- Live OpenAI API calls.
- Live OpenAI workload identity token exchange.
- OpenAI Codex harness invocation.
- Live xAI API calls.
- xAI mTLS calls.
- BYOK OpenAI-compatible live probes.
- Local model process invocation.
- Enterprise gateway secret-manager integration.

## Invariants

- Providers remain execution backends, not resident agent identities.
- Credential references are IDs and safe metadata only.
- Secret material, raw env names, token paths, auth database paths, provider
  errors, API keys, OAuth tokens, refresh tokens, private keys, and device-code
  secrets must not enter ledger events, portable workspaces, browser DTOs,
  diagnostics, model prompts, tracked docs, factory claims, or agent memory.
- Provider byte transfer stays approval-gated and preview-hash-bound.
- Standard verification uses fake providers and fake secret stores only.

## File Structure

- `packages/agent/src/credential-reference.ts`: credential reference schemas,
  secret-safe creation helpers, and readiness state types.
- `packages/agent/src/secret-store.ts`: secret-store interface,
  non-serializable secret material wrapper, and fake in-memory store for tests.
- `packages/agent/src/provider-registry.ts`: provider descriptor registry,
  capability matching, and secret-safe registry validation.
- `packages/agent/src/provider-readiness.ts`: health check orchestration,
  readiness DTOs, setup-card DTOs, and diagnostic categories.
- `packages/agent/src/provider-selection.ts`: deterministic policy selection
  over task requirements, provider capabilities, credential readiness, and data
  transfer class.
- `packages/agent/test/credential-reference.test.ts`: credential reference and
  secret-store safety tests.
- `packages/agent/test/provider-registry.test.ts`: descriptor registry and
  fake provider capability tests.
- `packages/agent/test/provider-readiness.test.ts`: readiness diagnostics and
  setup-card tests.
- `packages/agent/test/provider-selection.test.ts`: policy selection tests.
- `packages/local-runtime/src/agent-http-routes.ts`: add read-only readiness
  route after foundation routes exist.
- `packages/local-runtime/test/agent-provider-readiness-routes.test.ts`: local
  runtime route tests.
- `packages/ui/src/agent/provider-setup-cards.ts`: browser-safe setup card
  model.
- `packages/ui/test/agent-provider-setup-cards.test.ts`: browser DTO safety
  tests.

## Task 1: Credential References And Secret Store Interface

**Files:**

- Create: `packages/agent/src/credential-reference.ts`
- Create: `packages/agent/src/secret-store.ts`
- Modify: `packages/agent/src/index.ts`
- Create: `packages/agent/test/credential-reference.test.ts`

- [ ] **Step 1: Write the failing credential reference tests**

Create `packages/agent/test/credential-reference.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createCredentialReference,
  credentialReferenceSchema,
  credentialReferenceStatusSchema
} from "../src/credential-reference.js";
import {
  FakeSecretStore,
  SecretMaterial,
  secretStoreHealthSchema
} from "../src/secret-store.js";

describe("agent credential references", () => {
  it("creates secret-free credential references for provider backends", () => {
    const ref = createCredentialReference({
      credentialRefId: "agent_credref_openai_api_default",
      providerId: "provider_openai_api_default",
      credentialKind: "api-key-bearer",
      scopeKind: "workspace",
      capabilityScopes: ["model-inference"],
      safeLabel: "OpenAI API reference",
      authorizedBy: "actor_case_owner",
      authorizedAt: "2026-07-07T22:00:00.000Z",
      policyVersion: "agent-provider-auth.v1",
      status: "linked"
    });

    expect(credentialReferenceSchema.parse(ref)).toEqual(ref);
    expect(JSON.stringify(ref)).not.toMatch(/sk-|live-secret-value|authorization:\s*bearer|password=|private key/i);
  });

  it("rejects secret-shaped labels, identifiers, and raw environment names", () => {
    expect(() =>
      createCredentialReference({
        credentialRefId: "agent_credref_bad",
        providerId: "provider_openai_api_default",
        credentialKind: "api-key-bearer",
        scopeKind: "workspace",
        capabilityScopes: ["model-inference"],
        safeLabel: "paste api key here",
        authorizedBy: "actor_case_owner",
        authorizedAt: "2026-07-07T22:00:00.000Z",
        policyVersion: "agent-provider-auth.v1",
        status: "linked"
      })
    ).toThrow(/secret-safe/i);
  });

  it("keeps secret material non-serializable", async () => {
    const store = new FakeSecretStore();
    await store.putForTest("agent_credref_openai_api_default", SecretMaterial.fromTestValue("live-secret-value"));
    const material = await store.resolve("agent_credref_openai_api_default");

    expect(material?.exposeForProviderAdapter()).toBe("live-secret-value");
    expect(JSON.stringify(material)).toBe("{}");
    expect(String(material)).toBe("[SecretMaterial]");
  });

  it("reports secret-store health without exposing binding details", async () => {
    const store = new FakeSecretStore();
    const missing = await store.health("agent_credref_missing");

    expect(secretStoreHealthSchema.parse(missing)).toMatchObject({
      credentialRefId: "agent_credref_missing",
      status: "missing-binding"
    });
    expect(JSON.stringify(missing)).not.toMatch(/live-secret-value|authorization:\s*bearer|password=|private key|secret=/i);
    expect(credentialReferenceStatusSchema.options).toContain("missing-binding");
  });
});
```

- [ ] **Step 2: Run the targeted failing tests**

Run:

```bash
npm test -- packages/agent/test/credential-reference.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/credential-reference.js"
```

- [ ] **Step 3: Add credential reference contracts**

Create `packages/agent/src/credential-reference.ts`:

```ts
import { z } from "zod";
import { assertAgentSecretSafeText } from "./secret-safety.js";

export const credentialKindSchema = z.enum([
  "api-key-bearer",
  "workload-identity-token",
  "subscription-oauth",
  "device-code-oauth",
  "local-no-secret",
  "mtls-certificate",
  "enterprise-gateway"
]);

export const credentialReferenceStatusSchema = z.enum([
  "linked",
  "missing-binding",
  "healthy",
  "expired",
  "revoked",
  "insufficient-scope",
  "unverified"
]);

export const credentialReferenceSchema = z.object({
  credentialRefId: z.string().regex(/^agent_credref_[a-zA-Z0-9_-]+$/),
  providerId: z.string().regex(/^provider_[a-zA-Z0-9_-]+$/),
  credentialKind: credentialKindSchema,
  scopeKind: z.enum(["machine", "user", "workspace", "organization", "enterprise"]),
  capabilityScopes: z.array(z.enum([
    "model-inference",
    "provider-health",
    "provider-parse",
    "harness-execution"
  ])).min(1),
  safeLabel: z.string().min(1),
  authorizedBy: z.string().min(3),
  authorizedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  rotationDueAt: z.string().datetime().optional(),
  revokedAt: z.string().datetime().optional(),
  status: credentialReferenceStatusSchema,
  policyVersion: z.string().min(1),
  sourceEventIds: z.array(z.string().regex(/^evt_[a-zA-Z0-9_-]+$/)).default([])
}).strict();

export type CredentialReference = z.infer<typeof credentialReferenceSchema>;
export type CredentialKind = z.infer<typeof credentialKindSchema>;
export type CredentialReferenceStatus = z.infer<typeof credentialReferenceStatusSchema>;

export function createCredentialReference(input: z.input<typeof credentialReferenceSchema>): CredentialReference {
  for (const [label, value] of Object.entries({
    credentialRefId: input.credentialRefId,
    providerId: input.providerId,
    safeLabel: input.safeLabel,
    authorizedBy: input.authorizedBy,
    policyVersion: input.policyVersion
  })) {
    if (typeof value === "string") {
      assertAgentSecretSafeText(value, label);
    }
  }
  return Object.freeze(credentialReferenceSchema.parse(input));
}
```

- [ ] **Step 4: Add secret-store interface and fake store**

Create `packages/agent/src/secret-store.ts`:

```ts
import { z } from "zod";

export const secretStoreHealthSchema = z.object({
  credentialRefId: z.string().regex(/^agent_credref_[a-zA-Z0-9_-]+$/),
  status: z.enum(["healthy", "missing-binding", "expired", "revoked", "unverified"]),
  checkedAt: z.string().datetime(),
  safeMessage: z.string().min(1)
}).strict();

export type SecretStoreHealth = z.infer<typeof secretStoreHealthSchema>;

export class SecretMaterial {
  static fromTestValue(value: string): SecretMaterial {
    return new SecretMaterial(value);
  }

  private constructor(private readonly value: string) {}

  exposeForProviderAdapter(): string {
    return this.value;
  }

  toJSON(): Record<string, never> {
    return {};
  }

  toString(): string {
    return "[SecretMaterial]";
  }
}

export interface SecretStore {
  resolve(credentialRefId: string): Promise<SecretMaterial | undefined>;
  health(credentialRefId: string): Promise<SecretStoreHealth>;
}

export class FakeSecretStore implements SecretStore {
  private readonly values = new Map<string, SecretMaterial>();

  async putForTest(credentialRefId: string, material: SecretMaterial): Promise<void> {
    this.values.set(credentialRefId, material);
  }

  async resolve(credentialRefId: string): Promise<SecretMaterial | undefined> {
    return this.values.get(credentialRefId);
  }

  async health(credentialRefId: string): Promise<SecretStoreHealth> {
    return Object.freeze({
      credentialRefId,
      status: this.values.has(credentialRefId) ? "healthy" : "missing-binding",
      checkedAt: "2026-07-07T22:00:00.000Z",
      safeMessage: this.values.has(credentialRefId)
        ? "Credential binding is available."
        : "Credential binding is missing on this machine."
    });
  }
}
```

- [ ] **Step 5: Export the new surfaces**

Modify `packages/agent/src/index.ts`:

```ts
export * from "./credential-reference.js";
export * from "./secret-store.js";
```

Keep existing exports in the file.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/credential-reference.test.ts
```

Expected:

```text
Test Files  1 passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/agent/src/credential-reference.ts packages/agent/src/secret-store.ts packages/agent/src/index.ts packages/agent/test/credential-reference.test.ts
git commit -m "feat: add agent credential references"
```

**Acceptance Criteria:**

- Credential references serialize safe metadata only.
- Secret material cannot be JSON serialized or stringified into a value.
- Missing local bindings produce safe health state.
- Raw env names and credential-shaped labels are rejected.

## Task 2: Provider Registry And Capability Descriptors

**Files:**

- Create: `packages/agent/src/provider-registry.ts`
- Modify: `packages/agent/src/provider.ts`
- Modify: `packages/agent/src/index.ts`
- Create: `packages/agent/test/provider-registry.test.ts`

- [ ] **Step 1: Write failing provider registry tests**

Create `packages/agent/test/provider-registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createProviderRegistry,
  providerCapabilityDescriptorSchema
} from "../src/provider-registry.js";

describe("provider capability registry", () => {
  it("registers provider backends without resident identity", () => {
    const registry = createProviderRegistry();
    registry.register({
      providerId: "provider_fake_local",
      label: "Fake local provider",
      adapterVersion: "agent-provider-auth.v1",
      backendKind: "local-engine",
      modelFamilies: ["fake-local"],
      modalities: ["text"],
      toolSupport: "none",
      structuredOutputSupport: "schema-strict",
      contextLimits: { maxInputTokens: 4096, maxOutputTokens: 1024 },
      credentialRequirements: [{ credentialKind: "local-no-secret", required: true }],
      dataHandlingNotes: "Runs locally with deterministic fake output.",
      costPolicy: "local-compute",
      workspaceScopes: ["workspace"],
      approvalProfile: "local-only",
      diagnosticContract: ["provider-ready", "model-output-invalid"],
      fakeSupport: true
    });

    const descriptor = registry.require("provider_fake_local");
    expect(providerCapabilityDescriptorSchema.parse(descriptor)).toEqual(descriptor);
    expect(descriptor).not.toHaveProperty("residentAgentId");
  });

  it("rejects secret-shaped descriptor fields", () => {
    const registry = createProviderRegistry();
    expect(() =>
      registry.register({
        providerId: "provider_bad",
        label: "Bearer secret provider",
        adapterVersion: "agent-provider-auth.v1",
        backendKind: "openai-api",
        modelFamilies: ["text"],
        modalities: ["text"],
        toolSupport: "function-calling",
        structuredOutputSupport: "schema-strict",
        credentialRequirements: [{ credentialKind: "api-key-bearer", required: true }],
        dataHandlingNotes: "Remote API provider.",
        costPolicy: "metered-api",
        workspaceScopes: ["workspace"],
        approvalProfile: "remote-byte-transfer-gated",
        diagnosticContract: ["needs-api-key"],
        fakeSupport: true
      })
    ).toThrow(/secret-safe/i);
  });

  it("matches providers by task capability and credential kind", () => {
    const registry = createProviderRegistry.withDefaultsForTest();
    expect(
      registry.match({
        modality: "text",
        structuredOutputRequired: true,
        credentialKinds: ["local-no-secret"],
        allowRemoteByteTransfer: false
      }).map((provider) => provider.providerId)
    ).toEqual(["provider_fake_local"]);
  });
});
```

- [ ] **Step 2: Run targeted failing tests**

Run:

```bash
npm test -- packages/agent/test/provider-registry.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/provider-registry.js"
```

- [ ] **Step 3: Implement provider registry**

Create `packages/agent/src/provider-registry.ts` with strict Zod schemas for:

- backend kinds
- modalities
- tool support
- structured output support
- credential requirements
- cost policy
- workspace scopes
- approval profiles
- provider capability descriptors

The module must export:

```ts
export function createProviderRegistry(): ProviderCapabilityRegistry;

export namespace createProviderRegistry {
  export function withDefaultsForTest(): ProviderCapabilityRegistry;
}
```

Implementation requirements:

- Reject secret-shaped provider IDs, labels, model family labels, diagnostic
  codes, and data-handling notes.
- Freeze descriptors before returning them.
- `match()` must be deterministic and sorted by provider ID.
- Default test registry includes only deterministic fake providers.

- [ ] **Step 4: Keep existing provider descriptor compatible**

Modify `packages/agent/src/provider.ts` so existing fake provider descriptors can
be converted into `ProviderCapabilityDescriptor` without adding live credential
behavior. Do not remove existing tests from the foundation package.

- [ ] **Step 5: Export registry surface**

Modify `packages/agent/src/index.ts`:

```ts
export * from "./provider-registry.js";
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/provider-registry.test.ts packages/agent/test/provider.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/agent/src/provider-registry.ts packages/agent/src/provider.ts packages/agent/src/index.ts packages/agent/test/provider-registry.test.ts
git commit -m "feat: add agent provider registry"
```

**Acceptance Criteria:**

- Provider descriptors are secret-safe and never include resident identity.
- Registry matching is deterministic.
- Fake providers are enough for standard verification.

## Task 3: Provider Readiness DTOs And Fake Health Checks

**Files:**

- Create: `packages/agent/src/provider-readiness.ts`
- Modify: `packages/agent/src/runtime-types.ts`
- Modify: `packages/agent/src/index.ts`
- Create: `packages/agent/test/provider-readiness.test.ts`

- [ ] **Step 1: Write failing readiness tests**

Create `packages/agent/test/provider-readiness.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createCredentialReference, FakeSecretStore, SecretMaterial } from "../src/index.js";
import {
  buildProviderReadiness,
  providerReadinessDtoSchema
} from "../src/provider-readiness.js";
import { createProviderRegistry } from "../src/provider-registry.js";

describe("provider readiness DTOs", () => {
  it("reports setup cards without raw secret locations", async () => {
    const dto = await buildProviderReadiness({
      registry: createProviderRegistry.withDefaultsForTest(),
      credentialReferences: [
        createCredentialReference({
          credentialRefId: "agent_credref_missing_api",
          providerId: "provider_fake_remote",
          credentialKind: "api-key-bearer",
          scopeKind: "workspace",
          capabilityScopes: ["model-inference"],
          safeLabel: "Remote API key",
          authorizedBy: "actor_case_owner",
          authorizedAt: "2026-07-07T22:00:00.000Z",
          policyVersion: "agent-provider-auth.v1",
          status: "linked"
        })
      ],
      secretStore: new FakeSecretStore(),
      now: () => "2026-07-07T22:15:00.000Z"
    });

    expect(providerReadinessDtoSchema.parse(dto)).toEqual(dto);
    expect(JSON.stringify(dto)).not.toMatch(/remote-provider-material|authorization:\s*bearer|password=|private key|secret=/i);
    expect(dto.cards.map((card) => card.state)).toContain("needs-api-key");
  });

  it("marks local fake provider as working without credentials", async () => {
    const dto = await buildProviderReadiness({
      registry: createProviderRegistry.withDefaultsForTest(),
      credentialReferences: [],
      secretStore: new FakeSecretStore(),
      now: () => "2026-07-07T22:15:00.000Z"
    });

    expect(dto.cards.find((card) => card.providerId === "provider_fake_local")).toMatchObject({
      state: "works-locally",
      requiredApprovalClass: "none"
    });
  });

  it("marks remote byte transfer as approval-gated even when credentials are linked", async () => {
    const store = new FakeSecretStore();
    await store.putForTest("agent_credref_fake_remote", SecretMaterial.fromTestValue("remote-provider-material"));
    const dto = await buildProviderReadiness({
      registry: createProviderRegistry.withDefaultsForTest(),
      credentialReferences: [
        createCredentialReference({
          credentialRefId: "agent_credref_fake_remote",
          providerId: "provider_fake_remote",
          credentialKind: "api-key-bearer",
          scopeKind: "workspace",
          capabilityScopes: ["model-inference"],
          safeLabel: "Remote API key",
          authorizedBy: "actor_case_owner",
          authorizedAt: "2026-07-07T22:00:00.000Z",
          policyVersion: "agent-provider-auth.v1",
          status: "linked"
        })
      ],
      secretStore: store,
      now: () => "2026-07-07T22:15:00.000Z"
    });

    expect(dto.cards.find((card) => card.providerId === "provider_fake_remote")).toMatchObject({
      state: "requires-byte-transfer-approval",
      requiredApprovalClass: "provider-byte-transfer"
    });
  });
});
```

- [ ] **Step 2: Run targeted failing tests**

Run:

```bash
npm test -- packages/agent/test/provider-readiness.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/provider-readiness.js"
```

- [ ] **Step 3: Implement readiness DTO schemas**

Create `packages/agent/src/provider-readiness.ts` with:

- `providerReadinessStateSchema`
- `providerSetupCardSchema`
- `providerReadinessDiagnosticSchema`
- `providerReadinessDtoSchema`
- `buildProviderReadiness(input)`

DTO states must include:

```ts
[
  "ready",
  "works-locally",
  "needs-api-key",
  "needs-workload-identity",
  "needs-oauth-sign-in",
  "needs-device-sign-in",
  "needs-mtls-binding",
  "credential-binding-missing",
  "credential-expired",
  "credential-revoked",
  "insufficient-scope",
  "provider-unavailable",
  "harness-not-installed",
  "local-model-not-running",
  "not-available-for-task",
  "policy-blocked",
  "requires-byte-transfer-approval",
  "health-unverified"
]
```

Implementation requirements:

- DTO schema version is `agent-provider-readiness.v1`.
- Cards include provider ID, safe label, backend kind, capability summary,
  credential kind summary, readiness state, required approval class, and safe
  action IDs.
- Diagnostics include category, severity, retryability, related safe IDs, and
  safe repair action IDs.
- No DTO field may expose raw env names, token strings, secret-store paths, auth
  file paths, or provider errors.

- [ ] **Step 4: Extend runtime status types**

Modify `packages/agent/src/runtime-types.ts` to include:

```ts
import type { ProviderReadinessDto } from "./provider-readiness.js";

export interface AgentProviderReadinessEnvelope {
  readonly providerReadiness: ProviderReadinessDto;
}
```

If `AgentStatusDto` already exists, add an optional `providerReadiness` field
without changing existing tests that construct minimal status DTOs.

- [ ] **Step 5: Export readiness surface**

Modify `packages/agent/src/index.ts`:

```ts
export * from "./provider-readiness.js";
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/provider-readiness.test.ts packages/agent/test/credential-reference.test.ts packages/agent/test/provider-registry.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/agent/src/provider-readiness.ts packages/agent/src/runtime-types.ts packages/agent/src/index.ts packages/agent/test/provider-readiness.test.ts
git commit -m "feat: add provider readiness dto"
```

**Acceptance Criteria:**

- Readiness DTOs are browser-safe.
- Missing local bindings are clear and non-leaky.
- Remote providers can be credential-ready while still byte-transfer-gated.

## Task 4: Provider Selection Policy

**Files:**

- Create: `packages/agent/src/provider-selection.ts`
- Modify: `packages/agent/src/index.ts`
- Create: `packages/agent/test/provider-selection.test.ts`

- [ ] **Step 1: Write failing selection tests**

Create `packages/agent/test/provider-selection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createProviderRegistry } from "../src/provider-registry.js";
import { selectProviderForTask } from "../src/provider-selection.js";

describe("provider selection policy", () => {
  it("prefers local providers for sensitive evidence when capable", () => {
    const selected = selectProviderForTask({
      registry: createProviderRegistry.withDefaultsForTest(),
      task: {
        modality: "text",
        structuredOutputRequired: true,
        sensitivity: "sensitive-evidence",
        requiresRemoteHarness: false
      },
      readinessByProviderId: {
        provider_fake_local: "works-locally",
        provider_fake_remote: "requires-byte-transfer-approval"
      },
      policy: {
        allowRemoteByteTransfer: false,
        preferredCostPolicy: "local-compute"
      }
    });

    expect(selected).toMatchObject({
      ok: true,
      providerId: "provider_fake_local",
      approvalClass: "none"
    });
  });

  it("returns approval-required when only remote provider can satisfy the task", () => {
    const selected = selectProviderForTask({
      registry: createProviderRegistry.withDefaultsForTest(),
      task: {
        modality: "text",
        structuredOutputRequired: true,
        sensitivity: "workspace-safe",
        requiresRemoteHarness: false
      },
      readinessByProviderId: {
        provider_fake_remote: "requires-byte-transfer-approval"
      },
      policy: {
        allowRemoteByteTransfer: true,
        preferredCostPolicy: "metered-api"
      }
    });

    expect(selected).toMatchObject({
      ok: true,
      providerId: "provider_fake_remote",
      approvalClass: "provider-byte-transfer"
    });
  });

  it("fails closed when subscription OAuth is not officially supported for the task", () => {
    const selected = selectProviderForTask({
      registry: createProviderRegistry.withDefaultsForTest(),
      task: {
        modality: "text",
        structuredOutputRequired: false,
        sensitivity: "workspace-safe",
        requiresRemoteHarness: true
      },
      readinessByProviderId: {
        provider_fake_subscription_harness: "needs-oauth-sign-in"
      },
      policy: {
        allowRemoteByteTransfer: true,
        preferredCostPolicy: "subscription-entitlement"
      }
    });

    expect(selected).toMatchObject({
      ok: false,
      category: "provider-not-ready"
    });
  });
});
```

- [ ] **Step 2: Run targeted failing tests**

Run:

```bash
npm test -- packages/agent/test/provider-selection.test.ts
```

Expected before implementation:

```text
Failed to resolve import "../src/provider-selection.js"
```

- [ ] **Step 3: Implement deterministic selection**

Create `packages/agent/src/provider-selection.ts`.

Implementation requirements:

- Do not mutate registry descriptors.
- Choose ready local providers before remote providers for sensitive evidence.
- Return `approvalClass: "provider-byte-transfer"` when remote byte transfer is
  allowed but must still be approved.
- Treat `needs-oauth-sign-in`, `needs-device-sign-in`, `needs-api-key`,
  `credential-binding-missing`, `credential-expired`, and `provider-unavailable`
  as not ready.
- Return safe failure categories only.

- [ ] **Step 4: Export selection surface**

Modify `packages/agent/src/index.ts`:

```ts
export * from "./provider-selection.js";
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- packages/agent/test/provider-selection.test.ts packages/agent/test/provider-readiness.test.ts
```

Expected:

```text
Test Files  2 passed
```

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/agent/src/provider-selection.ts packages/agent/src/index.ts packages/agent/test/provider-selection.test.ts
git commit -m "feat: add agent provider selection policy"
```

**Acceptance Criteria:**

- Selection is deterministic and policy-driven.
- Sensitive evidence prefers capable local providers.
- Remote byte transfer remains approval-gated.
- Unready subscription OAuth harnesses fail closed.

## Task 5: Local Runtime Route And Browser Setup Cards

**Files:**

- Modify: `packages/local-runtime/src/agent-http-routes.ts`
- Create: `packages/local-runtime/test/agent-provider-readiness-routes.test.ts`
- Create: `packages/ui/src/agent/provider-setup-cards.ts`
- Create: `packages/ui/test/agent-provider-setup-cards.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `packages/local-runtime/test/agent-provider-readiness-routes.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveLocalRuntimeConfig } from "../src/config.js";
import { createLocalRuntimeHttpHandler, type LocalRuntimeHttpHandler } from "../src/http-handler.js";

const handlers: LocalRuntimeHttpHandler[] = [];
const tempDirs: string[] = [];

afterEach(() => {
  for (const handler of handlers.splice(0)) {
    handler.close();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent provider readiness route", () => {
  it("returns browser-safe provider readiness without credentials", async () => {
    const handler = testHandler();
    const response = await handler({ method: "GET", url: "/api/agent/providers/readiness" });
    const body = JSON.parse(response.body) as { schemaVersion: string };

    expect(response.status).toBe(200);
    expect(body.schemaVersion).toBe("agent-provider-readiness.v1");
    expect(response.body).not.toMatch(/authorization:\s*bearer|password=|private key|secret=|raw-provider-material/i);
  });
});

function testHandler() {
  const cwd = mkdtempSync(join(tmpdir(), "cestus-agent-provider-readiness-"));
  tempDirs.push(cwd);
  const handler = createLocalRuntimeHttpHandler({
    config: resolveLocalRuntimeConfig({ cwd, env: {} }),
    actor: { id: "actor_provider_route", kind: "human", label: "Provider Route Test" },
    now: () => "2026-07-07T22:30:00.000Z"
  });
  handlers.push(handler);
  return handler;
}
```

- [ ] **Step 2: Write failing browser card tests**

Create `packages/ui/test/agent-provider-setup-cards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  providerSetupCardsFromReadiness,
  safeProviderSetupCardSchema
} from "../src/agent/provider-setup-cards.js";

describe("provider setup cards", () => {
  it("renders safe setup cards from readiness DTOs", () => {
    const cards = providerSetupCardsFromReadiness({
      schemaVersion: "agent-provider-readiness.v1",
      generatedAt: "2026-07-07T22:30:00.000Z",
      cards: [
        {
          providerId: "provider_fake_remote",
          label: "Fake remote provider",
          backendKind: "openai-compatible-api",
          state: "needs-api-key",
          capabilitySummary: ["text", "schema output"],
          credentialKindSummary: ["api-key-bearer"],
          requiredApprovalClass: "provider-byte-transfer",
          safeActionIds: ["action_link_provider_credential"]
        }
      ],
      diagnostics: []
    });

    expect(cards.map((card) => safeProviderSetupCardSchema.parse(card).state)).toEqual(["needs-api-key"]);
    expect(JSON.stringify(cards)).not.toMatch(/authorization:\s*bearer|password=|private key|secret=|raw-provider-material/i);
  });
});
```

- [ ] **Step 3: Run targeted failing tests**

Run:

```bash
npm test -- packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/ui/test/agent-provider-setup-cards.test.ts
```

Expected before implementation:

```text
provider readiness route and setup card module are not found
```

- [ ] **Step 4: Add read-only local runtime route**

Modify `packages/local-runtime/src/agent-http-routes.ts`:

- Add `GET /api/agent/providers/readiness`.
- Reuse the local runtime auth boundary.
- Build readiness through `buildProviderReadiness()` and fake/default registry
  wiring.
- Return safe JSON only.
- Do not add credential setup mutation in this task.

- [ ] **Step 5: Add browser setup-card mapper**

Create `packages/ui/src/agent/provider-setup-cards.ts`:

- Parse/freeze safe setup card DTOs.
- Map readiness states to display labels.
- Preserve safe action IDs only.
- Reject unsafe text before returning cards.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
npm test -- packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/ui/test/agent-provider-setup-cards.test.ts packages/ui/test/agent-adapter.test.ts
```

Expected:

```text
Test Files  3 passed
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/local-runtime/src/agent-http-routes.ts packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/ui/src/agent/provider-setup-cards.ts packages/ui/test/agent-provider-setup-cards.test.ts
git commit -m "feat: expose provider readiness cards"
```

**Acceptance Criteria:**

- Runtime exposes provider readiness as a read-only safe DTO.
- Browser cards never include raw env names, credential values, or auth paths.
- Setup actions are opaque safe IDs.

## Task 6: Verification And Readiness

**Files:**

- Modify: `docs/agentic/software-factory.md`
- Modify: `docs/superpowers/plans/2026-07-07-resident-agent-provider-auth-implementation.md`

- [ ] **Step 1: Run focused verification**

Run:

```bash
npm test -- packages/agent/test/credential-reference.test.ts packages/agent/test/provider-registry.test.ts packages/agent/test/provider-readiness.test.ts packages/agent/test/provider-selection.test.ts packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/ui/test/agent-provider-setup-cards.test.ts
```

Expected:

```text
Test Files  6 passed
```

- [ ] **Step 2: Run full verification**

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

- [ ] **Step 3: Check whitespace**

Run:

```bash
git diff --check
```

Expected:

```text
no output
```

- [ ] **Step 4: Record readiness evidence**

Append a `Resident Agent Provider/Auth First Slice Readiness` section to
`docs/agentic/software-factory.md` with:

- design file path
- plan file path
- focused verification command
- full verification command
- statement that the slice uses fake providers and fake secret stores only
- statement that live OpenAI, live xAI, BYOK, local model, and enterprise
  gateway calls remain separate approved work

Update this plan with the observed command evidence.

- [ ] **Step 5: Run factory check**

Run:

```bash
npm run factory:check
```

Expected:

```text
factory-readiness passed
```

- [ ] **Step 6: Commit readiness evidence**

Run:

```bash
git add docs/agentic/software-factory.md docs/superpowers/plans/2026-07-07-resident-agent-provider-auth-implementation.md
git commit -m "docs: record provider auth readiness"
```

Recorded 2026-07-07 command evidence:

```text
npm test -- packages/agent/test/credential-reference.test.ts packages/agent/test/provider-registry.test.ts packages/agent/test/provider-readiness.test.ts packages/agent/test/provider-selection.test.ts packages/local-runtime/test/agent-provider-readiness-routes.test.ts packages/ui/test/agent-provider-setup-cards.test.ts
Test Files  6 passed (6)
Tests  53 passed (53)

npm run verify
typecheck passed
Test Files  125 passed (125)
Tests  1163 passed (1163)
tests passed
Vite build succeeded
factory-readiness passed

git diff --check
No output.

npm run factory:check
factory-readiness passed
```

**Acceptance Criteria:**

- Focused and full verification pass.
- Factory readiness passes.
- Readiness evidence is additive.
- No standard verifier needs credentials, live provider calls, or outbound byte
  transfer.

## Completion Criteria

The first provider/auth slice is complete when:

- Credential references are secret-free and strict.
- Secret material is non-serializable.
- Provider registry descriptors are secret-safe and identity-safe.
- Readiness DTOs and setup cards are browser-safe.
- Provider selection is policy-driven and fake-provider testable.
- Local runtime exposes read-only readiness.
- `npm run verify` passes.
- The branch has one commit per completed task.
