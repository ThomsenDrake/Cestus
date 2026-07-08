import { describe, expect, it } from "vitest";
import {
  agentProviderSmokeResultSchema,
  runLiveNousProviderSmoke,
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

  it("returns safe JSON when local provider configuration is invalid", async () => {
    const result = await runLiveNousProviderSmoke({
      cwd: "/tmp/cestus-provider-smoke-invalid-config",
      env: {
        CESTUS_AGENT_NOUS_API_KEY: "runtime-provider-material",
        CESTUS_AGENT_NOUS_ENDPOINT: "not-a-url"
      },
      now: () => "2026-07-08T12:20:00.000Z"
    });

    expect(agentProviderSmokeResultSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      ok: false,
      category: "provider-smoke-failed",
      modelId: "unknown-model",
      diagnostic: {
        message: "Live provider smoke failed.",
        allowedRepairActions: ["run local provider troubleshooting", "inspect local Nous provider configuration"]
      }
    });
    expect(JSON.stringify(result)).not.toMatch(/runtime-provider-material|not-a-url|authorization:\s*bearer|zod/i);
  });
});
