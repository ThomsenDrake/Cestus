import { z } from "zod";
import {
  providerReadinessApprovalClassSchema,
  providerReadinessDtoSchema,
  providerReadinessStateSchema,
  providerSetupCardSchema,
  type ProviderReadinessState
} from "../../../agent/src/provider-readiness.js";
import { credentialKindSchema } from "../../../agent/src/credential-reference.js";
import { providerBackendKindSchema } from "../../../agent/src/provider-registry.js";
import { isAgentSecretSafeText } from "../../../agent/src/secret-safety.js";

const displayLabelByState = Object.freeze({
  ready: "Ready",
  "works-locally": "Works locally",
  "needs-api-key": "Needs API key",
  "needs-workload-identity": "Needs workload identity",
  "needs-oauth-sign-in": "Needs sign-in",
  "needs-device-sign-in": "Needs device sign-in",
  "needs-mtls-binding": "Needs mTLS binding",
  "credential-binding-missing": "Local binding missing",
  "credential-expired": "Access expired",
  "credential-revoked": "Access revoked",
  "insufficient-scope": "Scope too narrow",
  "provider-unavailable": "Provider unavailable",
  "harness-not-installed": "Harness not installed",
  "local-model-not-running": "Local model not running",
  "not-available-for-task": "Not available",
  "policy-blocked": "Blocked by policy",
  "requires-byte-transfer-approval": "Needs byte transfer approval",
  "health-unverified": "Health unverified"
} satisfies Record<ProviderReadinessState, string>);

const rawCredentialLocationPattern =
  /(?:^~|[./\\])[^ \n\r\t]*(?:auth|oauth|token|secret|credential|credentials|private[-_]?key)[^ \n\r\t]*/i;
const providerErrorPattern = /\b(?:provider\s+error|stack\s+trace|traceback|exception)\b/i;

const allowedBrowserLiteralText = new Set<string>([
  ...credentialKindSchema.options,
  ...providerBackendKindSchema.options,
  ...providerReadinessApprovalClassSchema.options,
  ...providerReadinessStateSchema.options,
  ...Object.values(displayLabelByState)
]);

const safeBrowserTextSchema = z.string().min(1).refine(isBrowserSetupCardSafeText, {
  message: "must be browser-safe provider setup text"
});

export const safeProviderSetupCardSchema = providerSetupCardSchema.extend({
  displayLabel: safeBrowserTextSchema
}).strict();

export type SafeProviderSetupCard = z.infer<typeof safeProviderSetupCardSchema>;

export function providerSetupCardsFromReadiness(value: unknown): readonly SafeProviderSetupCard[] {
  const readiness = providerReadinessDtoSchema.parse(value);
  const cards = readiness.cards.map((card) =>
    safeProviderSetupCardSchema.parse({
      ...card,
      displayLabel: displayLabelByState[card.state]
    })
  );

  assertBrowserSetupCardsSecretSafe(cards);

  return Object.freeze(cards.map(freezeProviderSetupCard));
}

function freezeProviderSetupCard(card: SafeProviderSetupCard): SafeProviderSetupCard {
  return Object.freeze({
    ...card,
    capabilitySummary: Object.freeze([...card.capabilitySummary]),
    credentialKindSummary: Object.freeze([...card.credentialKindSummary]),
    safeActionIds: Object.freeze([...card.safeActionIds])
  }) as SafeProviderSetupCard;
}

function assertBrowserSetupCardsSecretSafe(cards: readonly SafeProviderSetupCard[]): void {
  assertSecretSafeStructure(cards, "providerSetupCards");
}

function assertSecretSafeStructure(value: unknown, path: string): void {
  if (typeof value === "string") {
    assertBrowserSetupCardSafeText(value, path);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSecretSafeStructure(item, `${path}.${index}`));
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      assertBrowserSetupCardSafeText(key, `${path}.${key}`);
      assertSecretSafeStructure(nested, `${path}.${key}`);
    }
  }
}

function assertBrowserSetupCardSafeText(value: string, label: string): void {
  if (!isBrowserSetupCardSafeText(value)) {
    throw new Error(`${label} must be browser-safe provider setup text`);
  }
}

function isBrowserSetupCardSafeText(value: string): boolean {
  return allowedBrowserLiteralText.has(value) ||
    (
      isAgentSecretSafeText(value) &&
      !rawCredentialLocationPattern.test(value) &&
      !providerErrorPattern.test(value)
    );
}
