import { describe, expect, it } from "vitest";
import {
  providerSetupCardsFromReadiness,
  safeProviderSetupCardSchema
} from "../src/agent/provider-setup-cards.js";

describe("provider setup cards", () => {
  it("renders safe setup cards from readiness DTOs", () => {
    const cards = providerSetupCardsFromReadiness({
      ...readinessFixture(),
      cards: [cardFixture()]
    });

    expect(cards.map((card) => safeProviderSetupCardSchema.parse(card).state)).toEqual(["needs-api-key"]);
    expect(JSON.stringify(cards)).not.toMatch(/authorization:\s*bearer|password=|private key|secret=|raw-provider-material/i);
  });

  it.each([
    ["lowercase env-shaped label", { label: "openai_api_key" }],
    ["hyphenated credential-shaped label", { label: "openai-api-key" }],
    ["uppercase raw environment label", { label: "OPENAI_API_KEY" }],
    ["auth file path label", { label: "/home/cestus/.config/openai/token.json" }],
    ["credential-shaped capability", { capabilitySummary: ["text", "client_secret"] }]
  ])("rejects unsafe provider card text: %s", (_name, overrides) => {
    expect(() =>
      providerSetupCardsFromReadiness({
        ...readinessFixture(),
        cards: [cardFixture(overrides)]
      })
    ).toThrow();
  });

  it.each([
    "action_openai_api_key",
    "action_openai_token"
  ])("rejects non-opaque setup action ids: %s", (safeActionId) => {
    expect(() =>
      providerSetupCardsFromReadiness({
        ...readinessFixture(),
        cards: [cardFixture({ safeActionIds: [safeActionId] })]
      })
    ).toThrow();
  });

  it("rejects unsafe diagnostic action arrays before mapping cards", () => {
    expect(() =>
      providerSetupCardsFromReadiness({
        ...readinessFixture(),
        cards: [cardFixture()],
        diagnostics: [
          diagnosticFixture({
            safeRepairActionIds: ["action_openai_token"]
          })
        ]
      })
    ).toThrow();
  });

  it("rejects unsafe diagnostic related ids before mapping cards", () => {
    expect(() =>
      providerSetupCardsFromReadiness({
        ...readinessFixture(),
        cards: [cardFixture()],
        diagnostics: [
          diagnosticFixture({
            relatedSafeIds: ["action_openai_api_key"]
          })
        ]
      })
    ).toThrow();
  });

  it("rejects unsafe diagnostic ids even with readiness-state suffixes", () => {
    expect(() =>
      providerSetupCardsFromReadiness({
        ...readinessFixture(),
        cards: [cardFixture()],
        diagnostics: [
          diagnosticFixture({
            diagnosticId: "diag_openai_api_key_needs_api_key"
          })
        ]
      })
    ).toThrow();
  });

  it("rejects unsafe diag related ids even with readiness-state suffixes", () => {
    expect(() =>
      providerSetupCardsFromReadiness({
        ...readinessFixture(),
        cards: [cardFixture()],
        diagnostics: [
          diagnosticFixture({
            relatedSafeIds: ["diag_openai_token_provider_unavailable"]
          })
        ]
      })
    ).toThrow();
  });
});

function readinessFixture(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "agent-provider-readiness.v1",
    generatedAt: "2026-07-07T22:30:00.000Z",
    cards: [cardFixture()],
    diagnostics: [],
    ...overrides
  };
}

function cardFixture(overrides: Record<string, unknown> = {}) {
  return {
    providerId: "provider_fake_remote",
    label: "Fake remote provider",
    backendKind: "openai-compatible-api",
    state: "needs-api-key",
    capabilitySummary: ["text", "schema output"],
    credentialKindSummary: ["api-key-bearer"],
    requiredApprovalClass: "provider-byte-transfer",
    safeActionIds: ["action_link_provider_credential"],
    ...overrides
  };
}

function diagnosticFixture(overrides: Record<string, unknown> = {}) {
  return {
    diagnosticId: "diag_fake_remote_needs_api_key",
    providerId: "provider_fake_remote",
    category: "needs-api-key",
    severity: "warning",
    retryability: "after-operator-action",
    relatedSafeIds: ["provider_fake_remote"],
    safeRepairActionIds: ["action_link_provider_credential"],
    checkedAt: "2026-07-07T22:30:00.000Z",
    ...overrides
  };
}
