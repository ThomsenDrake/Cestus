import { describe, expect, it } from "vitest";
import { createXaiSubscriptionHarness } from "../src/xai-subscription-harness.js";

const capabilityHash = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
const approvalBindingHash = "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const documentationHash = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

function currentPosture(overrides: Record<string, unknown> = {}) {
  return {
    residentAgentId: "agent_default" as const,
    workspaceId: "workspace_primary",
    mountInstanceId: "mount_primary",
    taskId: "task_primary",
    attemptId: "attempt_primary",
    runId: "run_primary",
    providerId: "provider_xai_grok",
    modelId: "grok-4",
    capabilityHash,
    credentialReference: {
      credentialRefId: "agent_credref_xai_primary",
      providerId: "provider_xai_grok",
      credentialKind: "subscription-oauth" as const,
      status: "healthy" as const,
      capabilityScopes: ["harness-execution"] as const
    },
    policy: {
      policyVersion: "policy_xai_harness_v1",
      providerId: "provider_xai_grok",
      modelId: "grok-4",
      capabilityHash,
      allowOfficialXaiHarness: true,
      officialFlowId: "xai-grok-named-integration.v1"
    },
    approval: {
      approvalClass: "provider-byte-transfer" as const,
      status: "approved" as const,
      bindingHash: approvalBindingHash
    },
    sourceEventIds: ["evt_xai_policy_current"] as const,
    ...overrides
  };
}

function createHarness(input: Record<string, unknown> = {}): ReturnType<typeof createXaiSubscriptionHarness> {
  return createXaiSubscriptionHarness({
    currentPosture: currentPosture(),
    ...input
  });
}

describe("official xAI subscription harness", () => {
  it("rejects each prohibited unofficial source without inspecting its material", async () => {
    const prohibitedSources = [
      "browser-cookie",
      "browser-session-storage",
      "browser-session-data",
      "token-cache",
      "cli-auth-store",
      "environment-token",
      "intercepted-header",
      "undocumented-endpoint",
      "reverse-engineered-grant",
      "subscription-to-api-key-conversion"
    ];

    for (const kind of prohibitedSources) {
      const sourceMaterial = `unsafe-${kind}-material`;
      const result = await createHarness().assess({
        posture: currentPosture(),
        officialFlow: { kind, material: sourceMaterial }
      });

      expect(result).toMatchObject({
        kind: "blocked",
        category: "prohibited-credential-source",
        safeDiagnosticCodes: ["prohibited-credential-source"]
      });
      expect(JSON.stringify(result)).not.toContain(sourceMaterial);
    }
  });

  it("classifies a prohibited source before inspecting its accessor-backed material", async () => {
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

    const result = await createHarness().assess({
      posture: currentPosture(),
      officialFlow
    });

    expect(materialDescriptorReads).toBe(0);
    expect(materialValueReads).toBe(0);
    expect(result).toMatchObject({
      kind: "blocked",
      category: "prohibited-credential-source"
    });
  });

  it("fails closed without append or unavailable when no authenticated mounted readback capability exists", async () => {
    const result = await createHarness().assess({
      posture: currentPosture(),
      officialFlow: undefined
    });

    expect(result).toEqual({
      kind: "blocked",
      category: "feasibility-append-unavailable",
      providerId: "provider_xai_grok",
      modelId: "grok-4",
      capabilityHash,
      safeDiagnosticCodes: ["feasibility-append-unavailable"]
    });
  });

  it("rejects unrecognized secret or alternate-provider ports instead of resolving, emulating, or substituting", async () => {
    let secretResolutions = 0;
    let alternateProviderCalls = 0;
    const harness = createHarness({
      resolveSecret: () => { secretResolutions += 1; },
      useAlternateProvider: () => { alternateProviderCalls += 1; }
    });

    const result = await harness.assess({ posture: currentPosture(), officialFlow: undefined });

    expect(result).toMatchObject({ kind: "blocked", category: "unsafe-input" });
    expect(secretResolutions).toBe(0);
    expect(alternateProviderCalls).toBe(0);
  });

  it.each([
    ["policy", currentPosture({ policy: { ...currentPosture().policy, policyVersion: "policy_xai_harness_v2" } })],
    ["capability", currentPosture({
      capabilityHash: approvalBindingHash,
      policy: { ...currentPosture().policy, capabilityHash: approvalBindingHash }
    })],
    ["credential reference", currentPosture({ credentialReference: { ...currentPosture().credentialReference, credentialRefId: "agent_credref_xai_other" } })],
    ["workspace", currentPosture({ workspaceId: "workspace_other" })],
    ["mount", currentPosture({ mountInstanceId: "mount_other" })],
    ["run", currentPosture({ runId: "run_other" })],
    ["approval", currentPosture({ approval: { ...currentPosture().approval, bindingHash: documentationHash } })]
  ])("fails closed for a swapped %s binding before any feasibility result", async (_binding, posture) => {
    const result = await createHarness().assess({ posture, officialFlow: undefined });

    expect(result).toMatchObject({
      kind: "blocked",
      category: "posture-mismatch",
      safeDiagnosticCodes: ["posture-mismatch"]
    });
  });

  it("fails closed for unsafe posture data before any feasibility result", async () => {
    const scopes = Proxy.revocable(["harness-execution"], {});
    scopes.revoke();

    await expect(createHarness().assess({
      posture: currentPosture({
        credentialReference: {
          ...currentPosture().credentialReference,
          capabilityScopes: scopes.proxy
        }
      }),
      officialFlow: undefined
    })).resolves.toMatchObject({ kind: "blocked", category: "unsafe-input" });
  });

  it("rejects a self-consistent non-xAI provider posture before any feasibility result", async () => {
    const result = await createHarness().assess({
      posture: currentPosture({
        providerId: "provider_openai_codex",
        modelId: "codex-latest",
        credentialReference: {
          ...currentPosture().credentialReference,
          providerId: "provider_openai_codex"
        },
        policy: {
          ...currentPosture().policy,
          providerId: "provider_openai_codex",
          modelId: "codex-latest"
        }
      }),
      officialFlow: undefined
    });

    expect(result).toMatchObject({ kind: "blocked", category: "unsafe-input" });
  });

  it("rejects a caller-supplied test route instead of exposing a feasibility result", async () => {
    const result = await createHarness().assess({
      posture: currentPosture(),
      officialFlow: {
        kind: "test-official-xai-route",
        officialFlowId: "xai-grok-named-integration.v1",
        documentationHash,
        interfaceOnly: true
      }
    });

    expect(result).toMatchObject({ kind: "blocked", category: "unsafe-input" });
  });

  it("rejects a raw no-op feasibility callback without invoking it", async () => {
    let calls = 0;
    const result = await createHarness({
      feasibilityAuthority: {
        appendOfficialFlowUnavailable: async () => {
          calls += 1;
          return undefined;
        }
      }
    }).assess({ posture: currentPosture(), officialFlow: undefined });

    expect(result).toMatchObject({ kind: "blocked", category: "unsafe-input" });
    expect(calls).toBe(0);
  });

  it("rejects a raw mismatched readback callback without invoking it", async () => {
    let calls = 0;
    const result = await createHarness({
      feasibilityAuthority: {
        appendOfficialFlowUnavailable: async (evidence: unknown) => {
          calls += 1;
          return {
            record: { ...(evidence as Record<string, unknown>), runId: "run_other" },
            feasibilityEventId: "evt_xai_mismatched_append",
            readbackEventId: "evt_xai_mismatched_readback"
          };
        }
      }
    }).assess({ posture: currentPosture(), officialFlow: undefined });

    expect(result).toMatchObject({ kind: "blocked", category: "unsafe-input" });
    expect(calls).toBe(0);
  });

  it("rejects a raw throwing feasibility callback without invoking it", async () => {
    let calls = 0;
    const result = await createHarness({
      feasibilityAuthority: {
        appendOfficialFlowUnavailable: async () => {
          calls += 1;
          throw new Error("forged authority should not run");
        }
      }
    }).assess({ posture: currentPosture(), officialFlow: undefined });

    expect(result).toMatchObject({ kind: "blocked", category: "unsafe-input" });
    expect(calls).toBe(0);
  });

  it("rejects a copied exact evidence readback with fake patterned event IDs without invoking it", async () => {
    let calls = 0;
    const result = await createHarness({
      feasibilityAuthority: {
        appendOfficialFlowUnavailable: async (evidence: unknown) => {
          calls += 1;
          return {
            record: { ...(evidence as Record<string, unknown>) },
            feasibilityEventId: "evt_forged_xai_append",
            readbackEventId: "evt_forged_xai_readback"
          };
        }
      }
    }).assess({ posture: currentPosture(), officialFlow: undefined });

    expect(result).toMatchObject({ kind: "blocked", category: "unsafe-input" });
    expect(result.kind).not.toBe("unavailable");
    expect(calls).toBe(0);
  });
});
