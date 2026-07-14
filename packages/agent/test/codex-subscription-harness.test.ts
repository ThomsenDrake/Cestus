import { describe, expect, it } from "vitest";
import {
  createCodexSubscriptionHarness,
  type CodexOfficialFlowUnavailableEvidence
} from "../src/codex-subscription-harness.js";

const capabilityHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const approvalBindingHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const documentationHash = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

function currentPosture(overrides: Record<string, unknown> = {}) {
  return {
    residentAgentId: "agent_default" as const,
    workspaceId: "workspace_primary",
    mountInstanceId: "mount_primary",
    taskId: "task_primary",
    attemptId: "attempt_primary",
    runId: "run_primary",
    providerId: "provider_openai_codex",
    modelId: "codex-latest",
    capabilityHash,
    credentialReference: {
      credentialRefId: "agent_credref_codex_primary",
      providerId: "provider_openai_codex",
      credentialKind: "subscription-oauth" as const,
      status: "healthy" as const,
      capabilityScopes: ["harness-execution"] as const
    },
    policy: {
      policyVersion: "policy_codex_harness_v1",
      providerId: "provider_openai_codex",
      modelId: "codex-latest",
      capabilityHash,
      allowOfficialCodexHarness: true,
      officialFlowId: "codex-official-local-workflow.v1"
    },
    approval: {
      approvalClass: "provider-byte-transfer" as const,
      status: "approved" as const,
      bindingHash: approvalBindingHash
    },
    sourceEventIds: ["evt_codex_policy_current"] as const,
    ...overrides
  };
}

function createHarness(input: {
  readonly appended: CodexOfficialFlowUnavailableEvidence[];
  readonly append?: (evidence: CodexOfficialFlowUnavailableEvidence) => Promise<unknown>;
}): ReturnType<typeof createCodexSubscriptionHarness> {
  return createCodexSubscriptionHarness({
    currentPosture: currentPosture(),
    feasibilityAuthority: {
      appendOfficialFlowUnavailable: async (evidence: CodexOfficialFlowUnavailableEvidence) => {
        input.appended.push(evidence);
        return input.append?.(evidence) ?? { kind: "appended" as const };
      }
    }
  });
}

describe("official Codex subscription harness", () => {
  it("rejects a cookie credential source without secret resolution, request, or provider substitution", async () => {
    const appended: CodexOfficialFlowUnavailableEvidence[] = [];
    const harness = createHarness({ appended });
    const rawCookieMaterial = "session=codex_cookie_material";

    const result = await harness.assess({
      posture: currentPosture(),
      officialFlow: {
        kind: "browser-cookie",
        material: rawCookieMaterial
      }
    });

    expect(result).toEqual({
      kind: "blocked",
      category: "prohibited-credential-source",
      providerId: "provider_openai_codex",
      modelId: "codex-latest",
      capabilityHash,
      safeDiagnosticCodes: ["prohibited-credential-source"]
    });
    expect(appended).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(rawCookieMaterial);
  });

  it("classifies a prohibited browser-cookie kind before inspecting accessor-backed material", async () => {
    const appended: CodexOfficialFlowUnavailableEvidence[] = [];
    const harness = createHarness({ appended });
    let materialDescriptorReads = 0;
    let materialValueReads = 0;
    const officialFlow = new Proxy(
      Object.defineProperty({ kind: "browser-cookie" }, "material", {
        enumerable: true,
        get() {
          materialValueReads += 1;
          throw new Error("prohibited material must not be read");
        }
      }),
      {
        getOwnPropertyDescriptor(target, property) {
          if (property === "material") {
            materialDescriptorReads += 1;
          }
          return Reflect.getOwnPropertyDescriptor(target, property);
        }
      }
    );

    const result = await harness.assess({
      posture: currentPosture(),
      officialFlow
    });

    expect(materialDescriptorReads).toBe(0);
    expect(materialValueReads).toBe(0);
    expect(result).toMatchObject({
      kind: "blocked",
      category: "prohibited-credential-source",
      safeDiagnosticCodes: ["prohibited-credential-source"]
    });
    expect(appended).toEqual([]);
  });

  it("appends only secret-safe official-flow-unavailable evidence when no official route is approved", async () => {
    const appended: CodexOfficialFlowUnavailableEvidence[] = [];
    const harness = createHarness({ appended });
    const tokenLikeMaterial = "sk-live-codex-subscription-material";

    const result = await harness.assess({
      posture: currentPosture(),
      officialFlow: undefined
    });

    expect(result).toEqual({
      kind: "unavailable",
      category: "official-flow-unavailable",
      providerId: "provider_openai_codex",
      modelId: "codex-latest",
      capabilityHash,
      safeDiagnosticCodes: ["official-flow-unavailable"]
    });
    expect(appended).toEqual([
      {
        recordVersion: "agent-provider-feasibility.v1",
        providerId: "provider_openai_codex",
        modelId: "codex-latest",
        capabilityHash,
        credentialRefId: "agent_credref_codex_primary",
        posture: "unavailable",
        category: "official-flow-unavailable",
        policyVersion: "policy_codex_harness_v1",
        workspaceId: "workspace_primary",
        mountInstanceId: "mount_primary",
        runId: "run_primary",
        approvalClass: "provider-byte-transfer",
        sourceEventIds: ["evt_codex_policy_current"],
        documentationHash: undefined,
        idempotencyKey: "provider_openai_codex|codex-official-local-workflow.v1|policy_codex_harness_v1|mount_primary"
      }
    ]);
    expect(JSON.stringify({ result, appended })).not.toContain(tokenLikeMaterial);
    expect(JSON.stringify({ result, appended })).not.toMatch(/cookie|session|authorization|bearer|api[ _-]?key/i);
  });

  it.each([
    "browser-session-storage",
    "token-cache",
    "cli-auth-store",
    "environment-token",
    "intercepted-header",
    "undocumented-api",
    "reverse-engineered-device-grant",
    "subscription-token-as-api-key"
  ])("rejects prohibited unofficial source %s without appending or exposing its material", async (kind) => {
    const appended: CodexOfficialFlowUnavailableEvidence[] = [];
    const harness = createHarness({ appended });
    const sourceMaterial = `unsafe-${kind}-material`;

    const result = await harness.assess({
      posture: currentPosture(),
      officialFlow: { kind, material: sourceMaterial }
    });

    expect(result).toMatchObject({
      kind: "blocked",
      category: "prohibited-credential-source",
      safeDiagnosticCodes: ["prohibited-credential-source"]
    });
    expect(appended).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(sourceMaterial);
  });

  it("fails closed on a stale policy before it can append unavailable evidence", async () => {
    const appended: CodexOfficialFlowUnavailableEvidence[] = [];
    const harness = createHarness({ appended });

    const result = await harness.assess({
      posture: currentPosture({
        policy: {
          ...currentPosture().policy,
          policyVersion: "policy_codex_harness_v2"
        }
      }),
      officialFlow: undefined
    });

    expect(result).toMatchObject({
      kind: "blocked",
      category: "posture-mismatch",
      safeDiagnosticCodes: ["posture-mismatch"]
    });
    expect(appended).toEqual([]);
  });

  it.each([
    ["approval", currentPosture({
      approval: {
        ...currentPosture().approval,
        bindingHash: documentationHash
      }
    })],
    ["credential kind", currentPosture({
      credentialReference: {
        ...currentPosture().credentialReference,
        credentialKind: "device-code-oauth" as const
      }
    })]
  ])("fails closed for a swapped %s posture binding before appending evidence", async (_binding, posture) => {
    const appended: CodexOfficialFlowUnavailableEvidence[] = [];
    const harness = createHarness({ appended });

    const result = await harness.assess({ posture, officialFlow: undefined });

    expect(result).toMatchObject({
      kind: "blocked",
      category: "posture-mismatch",
      safeDiagnosticCodes: ["posture-mismatch"]
    });
    expect(appended).toEqual([]);
  });

  it("rejects a revoked credential-scope proxy before appending feasibility evidence", async () => {
    const appended: CodexOfficialFlowUnavailableEvidence[] = [];
    const harness = createHarness({ appended });
    const scopes = Proxy.revocable(["harness-execution"], {});
    scopes.revoke();

    await expect(harness.assess({
      posture: currentPosture({
        credentialReference: {
          ...currentPosture().credentialReference,
          capabilityScopes: scopes.proxy
        }
      }),
      officialFlow: undefined
    })).resolves.toMatchObject({
      kind: "blocked",
      category: "unsafe-input",
      safeDiagnosticCodes: ["unsafe-input"]
    });
    expect(appended).toEqual([]);
  });

  it("permits a test-only official route to demonstrate the interface without claiming Codex feasibility", async () => {
    const appended: CodexOfficialFlowUnavailableEvidence[] = [];
    const harness = createHarness({ appended });

    const result = await harness.assess({
      posture: currentPosture(),
      officialFlow: {
        kind: "test-official-codex-route",
        officialFlowId: "codex-official-local-workflow.v1",
        documentationHash,
        interfaceOnly: true
      }
    });

    expect(result).toEqual({
      kind: "interface-demonstrated",
      category: "official-flow-interface-only",
      actualCodexFeasibility: false,
      providerId: "provider_openai_codex",
      modelId: "codex-latest",
      capabilityHash,
      safeDiagnosticCodes: ["official-flow-interface-only"]
    });
    expect(appended).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(/token|cookie|session|authorization|bearer/i);
  });
});
