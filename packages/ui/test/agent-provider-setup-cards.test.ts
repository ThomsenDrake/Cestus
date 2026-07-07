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
