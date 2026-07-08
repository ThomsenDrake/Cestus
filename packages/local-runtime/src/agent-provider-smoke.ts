import { createHash } from "node:crypto";
import { z } from "zod";
import type { ModelProviderAdapter } from "../../agent/src/index.js";
import { createLocalAgentProviderConfiguration } from "./agent-provider-readiness.js";

const smokeProviderId = "provider_nous_portal";
const smokeCredentialRefId = "agent_credref_nous_portal";
const smokeMarker = "cestus-live-provider-ok";
const smokePrompt = "Reply with exactly cestus-live-provider-ok and no other text.";
const smokeInputArtifactHash = `sha256:${createHash("sha256").update(smokePrompt).digest("hex")}`;

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
  marker: z.literal(smokeMarker).optional(),
  diagnostic: z.object({
    message: z.string().min(1),
    allowedRepairActions: z.array(z.string().min(1))
  }).optional()
}).strict();

export type AgentProviderSmokeResult = z.infer<typeof agentProviderSmokeResultSchema>;
export type AgentProviderSmokeFailureCategory = Exclude<AgentProviderSmokeResult["category"], "ok">;

export async function runLiveNousProviderSmoke(input: {
  readonly cwd: string;
  readonly env?: Record<string, string | undefined>;
  readonly now?: () => string;
}): Promise<AgentProviderSmokeResult> {
  const now = input.now ?? (() => new Date().toISOString());
  let configured: ReturnType<typeof createLocalAgentProviderConfiguration>;
  try {
    configured = createLocalAgentProviderConfiguration({
      cwd: input.cwd,
      now,
      resolveInputText: () => smokePrompt,
      ...(input.env === undefined ? {} : { env: input.env })
    });
  } catch (error) {
    return sanitizeProviderSmokeFailure({
      providerId: smokeProviderId,
      modelId: "unknown-model",
      category: "provider-smoke-failed",
      error
    });
  }
  const modelId = configured.readinessRegistry.require(smokeProviderId).modelFamilies[0] ?? "unknown-model";
  const provider = configured.providers.find((candidate) => candidate.describe().providerId === smokeProviderId);

  if (provider === undefined) {
    return providerSmokeFailure({
      modelId,
      category: "credential-missing",
      message: "Live provider credential is not configured.",
      allowedRepairActions: ["inspect local Nous provider configuration", "link the local Nous provider credential"]
    });
  }

  try {
    const result = await provider.invoke({
      invocationId: "inv_nous_provider_smoke",
      runId: "run_nous_provider_smoke",
      modelFamily: modelId,
      inputArtifactHash: smokeInputArtifactHash,
      credentialRef: {
        credentialRefId: smokeCredentialRefId,
        providerId: smokeProviderId,
        kind: "api-key-bearer",
        safeLabel: "Nous Portal local binding"
      }
    });
    return smokeResultFromProviderOutput({
      providerId: smokeProviderId,
      modelId,
      outputText: result.outputText
    });
  } catch (error) {
    return sanitizeProviderSmokeFailure({
      providerId: smokeProviderId,
      modelId,
      category: categoryForSmokeFailure(provider, error),
      error
    });
  }
}

export function smokeResultFromProviderOutput(input: {
  readonly providerId: "provider_nous_portal";
  readonly modelId: string;
  readonly outputText: string;
}): AgentProviderSmokeResult {
  const outputHash = hashProviderSmokeOutput(input.outputText);
  if (input.outputText === smokeMarker) {
    return freezeSmokeResult(agentProviderSmokeResultSchema.parse({
      schemaVersion: "agent-provider-smoke.v1",
      providerId: input.providerId,
      modelId: input.modelId,
      ok: true,
      category: "ok",
      outputHash,
      marker: smokeMarker
    }));
  }

  return freezeSmokeResult(agentProviderSmokeResultSchema.parse({
    schemaVersion: "agent-provider-smoke.v1",
    providerId: input.providerId,
    modelId: input.modelId,
    ok: false,
    category: "unexpected-provider-output",
    outputHash,
    diagnostic: {
      message: "Live provider returned unexpected smoke output.",
      allowedRepairActions: ["run local provider troubleshooting", "inspect local Nous provider configuration"]
    }
  }));
}

export function sanitizeProviderSmokeFailure(input: {
  readonly providerId: "provider_nous_portal";
  readonly modelId: string;
  readonly category: AgentProviderSmokeFailureCategory;
  readonly error: unknown;
}): AgentProviderSmokeResult {
  void input.error;
  return providerSmokeFailure({
    modelId: input.modelId,
    category: input.category,
    message: "Live provider smoke failed.",
    allowedRepairActions: ["run local provider troubleshooting", "inspect local Nous provider configuration"]
  });
}

function categoryForSmokeFailure(
  _provider: ModelProviderAdapter,
  _error: unknown
): AgentProviderSmokeFailureCategory {
  return "provider-smoke-failed";
}

function providerSmokeFailure(input: {
  readonly modelId: string;
  readonly category: AgentProviderSmokeFailureCategory;
  readonly message: string;
  readonly allowedRepairActions: readonly string[];
}): AgentProviderSmokeResult {
  return freezeSmokeResult(agentProviderSmokeResultSchema.parse({
    schemaVersion: "agent-provider-smoke.v1",
    providerId: smokeProviderId,
    modelId: input.modelId,
    ok: false,
    category: input.category,
    diagnostic: {
      message: input.message,
      allowedRepairActions: [...input.allowedRepairActions]
    }
  }));
}

function hashProviderSmokeOutput(outputText: string): string {
  return `sha256:${createHash("sha256").update(outputText).digest("hex")}`;
}

function freezeSmokeResult(result: AgentProviderSmokeResult): AgentProviderSmokeResult {
  return Object.freeze({
    ...result,
    ...(result.diagnostic === undefined
      ? {}
      : {
          diagnostic: Object.freeze({
            ...result.diagnostic,
            allowedRepairActions: Object.freeze([...result.diagnostic.allowedRepairActions])
          })
        })
  }) as AgentProviderSmokeResult;
}
