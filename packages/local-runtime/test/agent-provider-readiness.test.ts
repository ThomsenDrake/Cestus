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
