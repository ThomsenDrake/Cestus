import { describe, expect, it } from "vitest";
import { createLocalModelProvider } from "../src/local-model-provider.js";

const capabilityHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const promptArtifactHash = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const contextHash = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
const approvalBindingHash = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

function selectedCapability() {
  return {
    providerId: "provider_local_engine",
    modelId: "local-text-model",
    adapterVersion: "local-model-provider.v1",
    capabilityHash,
    backendKind: "local-engine" as const,
    modalities: ["text"] as const,
    structuredOutputSupport: "unsupported" as const,
    toolSupport: "none" as const,
    credentialKind: "local-no-secret" as const,
    costPolicy: "local-compute" as const,
    approvalProfile: "local-only" as const
  };
}

function selectedPolicy() {
  return {
    policyVersion: "policy_local_v1",
    providerId: "provider_local_engine",
    modelId: "local-text-model",
    capabilityHash,
    allowLocalModel: true,
    maxInputUnits: 128,
    maxOutputUnits: 64,
    maxConcurrentInvocations: 1,
    maxExecutionMilliseconds: 100
  };
}

function currentPreparation(overrides: Record<string, unknown> = {}) {
  return {
    residentAgentId: "agent_default" as const,
    workspaceId: "workspace_primary",
    mountInstanceId: "mount_primary",
    taskId: "task_primary",
    attemptId: "attempt_primary",
    runId: "run_primary",
    providerId: "provider_local_engine",
    modelId: "local-text-model",
    capabilityHash,
    credentialKind: "local-no-secret" as const,
    policyVersion: "policy_local_v1",
    approvalProfile: "local-only" as const,
    approvalBindingHash,
    promptArtifactHash,
    contextHash,
    modality: "text" as const,
    structuredOutputRequired: false,
    toolSupportRequired: "none" as const,
    inputUnits: 12,
    outputUnitBudget: 32,
    inputText: "Classify this local artifact.",
    ...overrides
  };
}

function availableEngine(input: {
  readonly execution?: (request: Record<string, unknown>, signal: AbortSignal) => Promise<{
    readonly inputUnits: number;
    readonly outputUnits: number;
  }>;
  readonly inspection?: Record<string, unknown>;
} = {}) {
  return {
    inspect: async () => input.inspection ?? {
      kind: "available" as const,
      modelIds: ["local-text-model"],
      modalities: ["text"],
      structuredOutputSupport: "unsupported" as const,
      toolSupport: "none" as const
    },
    execute: async (request: Record<string, unknown>, signal: AbortSignal) =>
      input.execution?.(request, signal) ?? { inputUnits: 12, outputUnits: 5 }
  };
}

describe("explicit local-model provider", () => {
  it("fails closed for an unavailable or unsupported selected local capability before execution", async () => {
    let executionCalls = 0;
    const provider = createLocalModelProvider({
      selectedCapability: selectedCapability(),
      selectedPolicy: selectedPolicy(),
      currentPreparation: currentPreparation(),
      engine: {
        async inspect() {
          return {
            kind: "unavailable" as const,
            category: "local-engine-unavailable" as const
          };
        },
        async execute() {
          executionCalls += 1;
          return { inputUnits: 12, outputUnits: 1 };
        }
      }
    });

    await expect(provider.invoke(currentPreparation())).resolves.toEqual({
      kind: "unavailable",
      category: "local-engine-unavailable",
      providerId: "provider_local_engine",
      modelId: "local-text-model",
      capabilityHash,
      safeDiagnosticCodes: ["local-engine-unavailable"]
    });
    expect(executionCalls).toBe(0);
  });

  it("rejects an explicit local engine that lacks the selected structured-output feature", async () => {
    let executionCalls = 0;
    const provider = createLocalModelProvider({
      selectedCapability: selectedCapability(),
      selectedPolicy: selectedPolicy(),
      currentPreparation: currentPreparation({ structuredOutputRequired: true }),
      engine: availableEngine({
        execution: async () => {
          executionCalls += 1;
          return { inputUnits: 12, outputUnits: 1 };
        }
      })
    });

    await expect(provider.invoke(currentPreparation({ structuredOutputRequired: true }))).resolves.toMatchObject({
      kind: "unavailable",
      category: "local-capability-unsupported",
      safeDiagnosticCodes: ["local-capability-unsupported"]
    });
    expect(executionCalls).toBe(0);
  });

  it.each([
    ["model", selectedCapability(), currentPreparation(), { modelIds: ["other-local-model"] }],
    ["modality", { ...selectedCapability(), modalities: ["code"] }, currentPreparation(), { modalities: ["text"] }],
    ["tool", selectedCapability(), currentPreparation({ toolSupportRequired: "function-calling" }), { toolSupport: "none" }]
  ])("rejects an unsupported selected local %s before execution", async (_requirement, capability, preparation, inspection) => {
    let executionCalls = 0;
    const provider = createLocalModelProvider({
      selectedCapability: capability,
      selectedPolicy: selectedPolicy(),
      currentPreparation: preparation,
      engine: availableEngine({
        inspection: {
          kind: "available",
          modelIds: ["local-text-model"],
          modalities: ["text"],
          structuredOutputSupport: "unsupported",
          toolSupport: "none",
          ...inspection
        },
        execution: async () => {
          executionCalls += 1;
          return { inputUnits: 12, outputUnits: 1 };
        }
      })
    });

    await expect(provider.invoke(preparation)).resolves.toMatchObject({
      kind: "unavailable",
      category: "local-capability-unsupported",
      safeDiagnosticCodes: ["local-capability-unsupported"]
    });
    expect(executionCalls).toBe(0);
  });

  it("fails closed when no explicit local capability was configured", async () => {
    const provider = createLocalModelProvider({} as never);

    await expect(provider.invoke(currentPreparation())).resolves.toEqual({
      kind: "blocked",
      category: "local-selection-mismatch",
      providerId: "provider_local_unavailable",
      modelId: "local-unavailable",
      capabilityHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      safeDiagnosticCodes: ["local-selection-mismatch"]
    });
  });

  it("executes only the current explicit credential-free local selection and returns a safe receipt", async () => {
    let invoked: Record<string, unknown> | undefined;
    const provider = createLocalModelProvider({
      selectedCapability: selectedCapability(),
      selectedPolicy: selectedPolicy(),
      currentPreparation: currentPreparation(),
      engine: availableEngine({
        execution: async (request) => {
          invoked = request;
          return { inputUnits: 12, outputUnits: 5 };
        }
      })
    });

    const result = await provider.invoke(currentPreparation());

    expect(result).toEqual({
      kind: "executed",
      providerId: "provider_local_engine",
      modelId: "local-text-model",
      capabilityHash,
      inputUnits: 12,
      outputUnits: 5,
      safeDiagnosticCodes: []
    });
    expect(invoked).toMatchObject({
      providerId: "provider_local_engine",
      modelId: "local-text-model",
      inputText: "Classify this local artifact.",
      promptArtifactHash,
      contextHash
    });
    expect(JSON.stringify(result)).not.toMatch(/https?:|classify this local artifact/i);
  });

  it.each([
    ["capability", currentPreparation({ capabilityHash: promptArtifactHash })],
    ["policy", currentPreparation({ policyVersion: "policy_local_v2" })],
    ["approval", currentPreparation({ approvalBindingHash: promptArtifactHash })],
    ["context", currentPreparation({ contextHash: promptArtifactHash })]
  ])("fails closed for a swapped %s binding before local engine inspection", async (_binding, swappedPreparation) => {
    let inspections = 0;
    const engine = availableEngine();
    const provider = createLocalModelProvider({
      selectedCapability: selectedCapability(),
      selectedPolicy: selectedPolicy(),
      currentPreparation: currentPreparation(),
      engine: {
        ...engine,
        inspect: async () => {
          inspections += 1;
          return engine.inspect();
        }
      }
    });

    await expect(provider.invoke(swappedPreparation)).resolves.toMatchObject({
      kind: "blocked",
      category: "local-preparation-stale",
      safeDiagnosticCodes: ["local-preparation-stale"]
    });
    expect(inspections).toBe(0);
  });

  it("fails closed before execution when a local-compute budget is exhausted", async () => {
    let executions = 0;
    const provider = createLocalModelProvider({
      selectedCapability: selectedCapability(),
      selectedPolicy: selectedPolicy(),
      currentPreparation: currentPreparation({ outputUnitBudget: 65 }),
      engine: availableEngine({
        execution: async () => {
          executions += 1;
          return { inputUnits: 12, outputUnits: 1 };
        }
      })
    });

    await expect(provider.invoke(currentPreparation({ outputUnitBudget: 65 }))).resolves.toMatchObject({
      kind: "blocked",
      category: "local-budget-exhausted",
      safeDiagnosticCodes: ["local-budget-exhausted"]
    });
    expect(executions).toBe(0);
  });

  it("does not leak an engine error or URL-shaped diagnostic", async () => {
    const provider = createLocalModelProvider({
      selectedCapability: selectedCapability(),
      selectedPolicy: selectedPolicy(),
      currentPreparation: currentPreparation(),
      engine: availableEngine({
        execution: async () => {
          throw new Error("https://local.invalid/debug?token=would-leak");
        }
      })
    });

    const result = await provider.invoke(currentPreparation());

    expect(result).toEqual({
      kind: "unavailable",
      category: "local-engine-unavailable",
      providerId: "provider_local_engine",
      modelId: "local-text-model",
      capabilityHash,
      safeDiagnosticCodes: ["local-engine-unavailable"]
    });
    expect(JSON.stringify(result)).not.toMatch(/https?:|token=|would-leak/i);
  });

  it("rejects a hostile preparation shape before local engine access", async () => {
    let inspections = 0;
    const engine = availableEngine();
    const provider = createLocalModelProvider({
      selectedCapability: selectedCapability(),
      selectedPolicy: selectedPolicy(),
      currentPreparation: currentPreparation(),
      engine: {
        ...engine,
        inspect: async () => {
          inspections += 1;
          return engine.inspect();
        }
      }
    });
    const hostile = new Proxy(currentPreparation(), {
      get() {
        throw new Error("proxy getter must not run");
      }
    });

    await expect(provider.invoke(hostile)).resolves.toMatchObject({
      kind: "blocked",
      category: "local-preparation-invalid",
      safeDiagnosticCodes: ["local-preparation-invalid"]
    });
    expect(inspections).toBe(0);
  });

  it("returns a bounded timeout result and aborts the injected local engine", async () => {
    let aborted = false;
    const provider = createLocalModelProvider({
      selectedCapability: selectedCapability(),
      selectedPolicy: { ...selectedPolicy(), maxExecutionMilliseconds: 10 },
      currentPreparation: currentPreparation(),
      engine: availableEngine({
        execution: async (_request, signal) => new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            resolve({ inputUnits: 12, outputUnits: 1 });
          }, { once: true });
        })
      })
    });

    await expect(provider.invoke(currentPreparation())).resolves.toMatchObject({
      kind: "blocked",
      category: "local-time-budget-exhausted",
      safeDiagnosticCodes: ["local-time-budget-exhausted"]
    });
    expect(aborted).toBe(true);
  });

  it("reserves the configured concurrency budget before a second engine execution", async () => {
    let releaseFirst: (() => void) | undefined;
    let executions = 0;
    const provider = createLocalModelProvider({
      selectedCapability: selectedCapability(),
      selectedPolicy: selectedPolicy(),
      currentPreparation: currentPreparation(),
      engine: availableEngine({
        execution: async () => {
          executions += 1;
          return new Promise((resolve) => {
            releaseFirst = () => resolve({ inputUnits: 12, outputUnits: 1 });
          });
        }
      })
    });

    const first = provider.invoke(currentPreparation());
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(provider.invoke(currentPreparation())).resolves.toMatchObject({
      kind: "blocked",
      category: "local-concurrency-exhausted",
      safeDiagnosticCodes: ["local-concurrency-exhausted"]
    });
    releaseFirst?.();
    await expect(first).resolves.toMatchObject({ kind: "executed" });
    expect(executions).toBe(1);
  });
});
