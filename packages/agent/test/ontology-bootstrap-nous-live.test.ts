import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SecretMaterial,
  StaticSecretStore,
  createNousPortalProvider
} from "../src/index.js";
import {
  buildOntologyBootstrapAgentReviewBundle
} from "../src/ontology-bootstrap-workflow.js";
import {
  buildOntologyBootstrapNousPrompt,
  validateOntologyBootstrapNousMemo
} from "../src/ontology-bootstrap-nous.js";
import {
  bootstrapEvidenceLinksFixture,
  bootstrapReportFixture,
  bootstrapReviewFixture
} from "../../ontology-bootstrap/test/fixtures/bootstrap-fixtures.js";
import { runFakeOntologyBootstrapSpecialist } from "../../ontology-bootstrap/src/fake-runtime.js";

const liveFlag = process.env.CESTUS_AGENT_LIVE_NOUS;
const env = loadNousEnv(process.cwd());
const liveDescribe = liveFlag === "1" ? describe : describe.skip;
const inputArtifactHash = "sha256:1212121212121212121212121212121212121212121212121212121212121212";

liveDescribe("live Nous ontology bootstrap review smoke", () => {
  it("returns a secret-safe review memo for a bootstrap dossier prompt", async () => {
    expect(env.apiKey).toBeDefined();
    const bootstrap = runFakeOntologyBootstrapSpecialist({
      sourceCollectionId: "src_old_cestus",
      report: bootstrapReportFixture,
      review: bootstrapReviewFixture,
      evidenceLinks: bootstrapEvidenceLinksFixture,
      selectedCandidateIds: ["legacy_candidate_001"],
      now: () => "2026-07-08T15:15:00.000Z"
    });
    expect(bootstrap.ok).toBe(true);
    if (!bootstrap.ok || env.apiKey === undefined) return;
    const bundle = buildOntologyBootstrapAgentReviewBundle({
      runId: "run_ontology_bootstrap_live",
      taskId: "task_ontology_bootstrap_live",
      generatedAt: "2026-07-08T15:15:00.000Z",
      dossier: bootstrap.dossier,
      toolPreviews: bootstrap.toolPreviews
    });
    const prompt = buildOntologyBootstrapNousPrompt({ bundle });
    const provider = createNousPortalProvider({
      secretStore: new StaticSecretStore({
        agent_credref_nous_portal: SecretMaterial.fromRuntimeValue(env.apiKey)
      }),
      ...(env.endpoint === undefined ? {} : { endpointUrl: env.endpoint }),
      ...(env.model === undefined ? {} : { modelId: env.model })
    });

    const result = await provider.invoke({
      invocationId: "inv_ontology_bootstrap_live",
      runId: "run_ontology_bootstrap_live",
      modelFamily: env.model ?? "tencent/hy3:free",
      inputArtifactHash,
      inputText: prompt,
      credentialRef: {
        credentialRefId: "agent_credref_nous_portal",
        providerId: "provider_nous_portal",
        kind: "api-key-bearer"
      }
    });
    const memo = validateOntologyBootstrapNousMemo(result.outputText);
    const serialized = JSON.stringify({ result, memo });

    expect(memo.allowedUse).toBe("review-note-only");
    expect(result.outputArtifactHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(serialized).not.toMatch(/api key|authorization|bearer|password|private key|oauth|credential/i);
    expect(serialized).not.toContain(env.apiKey);
  }, 60_000);
});

function loadNousEnv(cwd: string): {
  readonly apiKey?: string;
  readonly endpoint?: string;
  readonly model?: string;
} {
  const values: Record<string, string> = {};
  const envPath = join(cwd, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const index = line.indexOf("=");
      if (index > 0) {
        values[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      }
    }
  }
  const apiKey = process.env.CESTUS_AGENT_NOUS_API_KEY ?? values.CESTUS_AGENT_NOUS_API_KEY;
  const endpoint = process.env.CESTUS_AGENT_NOUS_ENDPOINT ?? values.CESTUS_AGENT_NOUS_ENDPOINT;
  const model = process.env.CESTUS_AGENT_NOUS_MODEL ?? values.CESTUS_AGENT_NOUS_MODEL;
  return {
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(endpoint === undefined ? {} : { endpoint }),
    ...(model === undefined ? {} : { model })
  };
}
